process.env.SUPABASE_URL = 'https://otp-fixture.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-otp-fixture';
process.env.JWT_SECRET = 'isolated-otp-secret-more-than-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { supabase } = require('../config/supabase');
const phoneOtpService = require('../services/phoneOtpService');
const esmsService = require('../services/esmsService');

test('production SMS refuses mock, missing credentials or sandbox without database/provider requests', async (t) => {
  process.env.NODE_ENV = 'production';
  process.env.ESMS_MOCK = 'true';
  t.mock.method(supabase, 'from', () => { throw new Error('Unexpected DB request'); });
  await assert.rejects(phoneOtpService.sendOtp({ userId: 1, phone: '0912345678' }), { statusCode: 503 });
  await assert.rejects(esmsService.sendOtpSms({ phone: '0912345678', otp: '123456' }), { statusCode: 503 });
});

test('OTP service sends only an account-bound HMAC to SQL, fails closed and enforces the DB limit result', async (t) => {
  let received;
  t.mock.method(supabase, 'rpc', async (name, args) => {
    assert.equal(name, 'consume_phone_otp'); received = args;
    return { data: { ok: false, code: 'ATTEMPT_LIMIT' } };
  });
  await assert.rejects(phoneOtpService.verifyOtp({ userId: 1, phone: '0912345678', otp: '123456' }), { statusCode: 429 });
  assert.equal(received.p_require_live, true);
  assert.match(received.p_code_hash, /^[a-f0-9]{64}$/);
  assert.equal(received.p_code_hash, crypto.createHmac('sha256', process.env.JWT_SECRET).update('1:0912345678:123456').digest('hex'));
  assert.equal(JSON.stringify(received).includes('123456"'), false);
});

test('new OTP records store a keyed hash and never store the delivered plaintext code', async (t) => {
  process.env.NODE_ENV = 'test';
  let delivered;
  let inserted;
  let reads = 0;
  t.mock.method(esmsService, 'isLiveSmsEnabled', () => false);
  t.mock.method(esmsService, 'sendOtpSms', async ({ otp }) => { delivered = otp; return { isMock: true }; });
  t.mock.method(supabase, 'from', (table) => {
    const query = {
      select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
      async single() { return { data: { id: 1 } }; },
      async maybeSingle() { reads++; return { data: null }; },
      update() { return this; }, insert(payload) { inserted = payload; return this; },
      then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); }
    };
    assert.ok(['users', 'phone_otps'].includes(table));
    return query;
  });
  await phoneOtpService.sendOtp({ userId: 1, phone: '0912345678' });
  assert.equal(reads, 1);
  assert.match(delivered, /^\d{6}$/);
  assert.equal(inserted.otp_code, 'REDACTED');
  assert.equal(inserted.delivered_live, false);
  assert.equal(inserted.otp_hash, crypto.createHmac('sha256', process.env.JWT_SECRET).update(`1:0912345678:${delivered}`).digest('hex'));
});

test('PostgreSQL OTP consume is single-use, bounded to five attempts and checks expiry, live delivery and user ownership', async () => {
  const db = new PGlite();
  const valid = 'a'.repeat(64);
  const invalid = 'b'.repeat(64);
  try {
    await db.exec(`SET timezone='UTC'; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE users(id bigint PRIMARY KEY,is_active boolean,phone text,phone_verified boolean,phone_verified_at timestamp);
      CREATE TABLE phone_otps(id serial PRIMARY KEY,user_id bigint,phone text,otp_code varchar(10),expires_at timestamp,
        is_used boolean DEFAULT false,attempt_count integer DEFAULT 0,created_at timestamp DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO users VALUES(1,true,NULL,false,NULL),(2,true,NULL,false,NULL),(3,false,NULL,false,NULL);
      INSERT INTO phone_otps(user_id,phone,otp_code,expires_at) VALUES(1,'0912345678','123456',CURRENT_TIMESTAMP+interval '1 hour');
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
      GRANT ALL ON users,phone_otps TO service_role; GRANT USAGE,SELECT ON SEQUENCE phone_otps_id_seq TO service_role;`);
    const migration = fs.readFileSync(path.join(__dirname, '../db-migration/013-security-phone-otp.sql'), 'utf8');
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query('SELECT otp_code,is_used FROM phone_otps')).rows[0], { otp_code: 'REDACTED', is_used: true });
    const insert = async (userId, live = true, age = '1 hour') => db.query(`INSERT INTO phone_otps
      (user_id,phone,otp_code,expires_at,otp_hash,delivered_live) VALUES($1,'0912345678','REDACTED',clock_timestamp()+$2::interval,$3,$4)`, [userId, age, valid, live]);
    const consume = async (userId, hash = valid, live = true) => (await db.query(
      "SELECT consume_phone_otp($1,'0912345678',$2,$3) AS result", [userId, hash, live]
    )).rows[0].result;
    await db.exec('SET ROLE anon'); await assert.rejects(consume(1), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE authenticated'); await assert.rejects(consume(1), /permission denied/);
    await db.exec('RESET ROLE; SET ROLE service_role');
    await insert(1);
    assert.equal((await consume(2)).code, 'NOT_FOUND');
    const attempts = await Promise.all(Array.from({ length: 10 }, () => consume(1, invalid)));
    assert.equal(attempts.filter((result) => result.code === 'INVALID').length, 5);
    assert.equal((await consume(1)).code, 'ATTEMPT_LIMIT');
    assert.equal((await db.query('SELECT phone_verified FROM users WHERE id=1')).rows[0].phone_verified, false);
    await insert(1, true, '-1 hour');
    assert.equal((await consume(1)).code, 'EXPIRED');
    await insert(1, false); assert.equal((await consume(1)).code, 'NOT_FOUND');
    await insert(1);
    const validAttempts = await Promise.all([consume(1), consume(1)]);
    assert.equal(validAttempts.filter((result) => result.ok).length, 1);
    assert.deepEqual((await db.query('SELECT phone,phone_verified FROM users WHERE id=1')).rows[0], { phone: '0912345678', phone_verified: true });
    await insert(3); assert.equal((await consume(3)).code, 'INACTIVE');
  } finally { await db.close(); }
});
