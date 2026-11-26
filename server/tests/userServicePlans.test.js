process.env.SUPABASE_URL = 'https://isolated-user-plans.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-user-service-plan-test-key';
process.env.JWT_SECRET = 'isolated-user-service-plan-test-jwt-secret-over-32-bytes';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { connectBillingDatabase } = require('./helpers/billingDatabase');
const { createTierDatabase } = require('./helpers/tierDatabase');
const { supabase } = require('../config/supabase');
const adminService = require('../services/adminPlanService');
const userPaymentRepository = require('../repositories/userPaymentRepository');
const { createPaymentService } = require('../services/paymentService');
const { appCache } = require('../services/ttlCache');

let db;
const migration = (name) => fs.readFileSync(path.join(__dirname, '../db-migration', name), 'utf8');
const rpc = async (name, args = []) => (await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS data`, args)).rows[0].data;
const change = (overrides = {}) => ({
  planCode: 'USER_PLUS',
  action: 'SAVE',
  requestId: randomUUID(),
  expectedVersion: 1,
  amount: 35000,
  durationMonths: 2,
  active: true,
  effectiveAt: null,
  reason: 'Điều chỉnh giá gói người dùng Plus',
  ...overrides
});
const sqlChange = (body, actor = 2) => rpc('admin_change_user_plan', [
  actor, body.requestId, body.expectedVersion, body.amount ?? null, body.durationMonths ?? null,
  body.active ?? null, body.effectiveAt ?? null, body.reason, body.action, body.planCode
]);
const reserve = (user = 1, version = 1, request = randomUUID()) => rpc('reserve_user_payment', [user, 'USER_PLUS', request, version]);

before(async () => {
  db = await createTierDatabase();
  await db.exec('DROP TABLE IF EXISTS public.user_subscriptions CASCADE; DROP TABLE IF EXISTS public.user_billing_plans CASCADE;');
  await db.exec(migration('020-schema-migration-ledger.sql'));
  await db.exec(migration('023-agent-subscription-management.sql'));
  await db.exec(migration('026-user-plus-and-official-listings.sql'));
  await db.exec(migration('030-admin-user-plus-pricing.sql'));
  await db.exec(migration('030-admin-user-plus-pricing.sql')); // idempotent re-run
});

beforeEach(async () => {
  await db.exec(`TRUNCATE users CASCADE;
    DELETE FROM user_plan_schedules;
    DELETE FROM user_plan_audit;
    INSERT INTO users(id,name,role) VALUES
      (1,'Customer A','USER'),(5,'Customer B','USER'),
      (2,'Admin','ADMIN'),(3,'Disabled Admin','ADMIN'),(4,'Unverified Admin','ADMIN'),
      (9,'Agent A','AGENT');
    UPDATE users SET is_active=false WHERE id=3;
    UPDATE users SET email_verified_at=NULL WHERE id=4;
    UPDATE user_billing_plans SET amount_vnd=20000,duration_months=1,active=true,version=1 WHERE code='USER_PLUS';`);
});

after(async () => db?.close());

test('030 migration records ledger and catalog returns USER_PLUS configuration', async () => {
  const ledger = await db.query("SELECT id FROM app_schema_migrations WHERE id='030'");
  assert.equal(ledger.rows.length, 1);

  const data = await rpc('admin_user_plan_catalog', [2]);
  assert.equal(data.plans.length, 1);
  assert.equal(data.plans[0].code, 'USER_PLUS');
  assert.equal(data.plans[0].amount_vnd, 20000);
  assert.equal(data.plans[0].duration_months, 1);
  assert.equal(data.plans[0].active, true);
  assert.equal(data.plans[0].version, 1);
  assert.deepEqual(data.pending, []);
});

test('updating USER_PLUS price keeps old orders intact and enforces new version on fresh checkouts', async () => {
  const request = randomUUID();
  const original = await reserve(1, 1, request);
  assert.equal(original.amount_vnd, 20000);

  await sqlChange(change());
  await assert.rejects(reserve(5, 1), /Stale plan/);

  const fresh = await reserve(5, 2);
  assert.equal(fresh.amount_vnd, 35000);
  assert.equal(fresh.duration_months, 2);
  assert.equal((await reserve(1, 1, request)).id, original.id);

  const paid = await rpc('settle_agent_payment', [
    original.order_code,
    '1234567890abcdef1234567890abcdef',
    original.amount_vnd,
    new Date().toISOString(),
    'user-plus-test-ref'
  ]);
  assert.equal(paid.amount_vnd, 20000);
  assert.equal(paid.duration_months, 1);
  assert.equal((await db.query('SELECT price_vnd FROM user_subscriptions WHERE user_id=1')).rows[0].price_vnd, 20000);
});

test('scheduled USER_PLUS price change applies automatically when due and supports cancellation', async () => {
  const scheduled = await sqlChange(change({ effectiveAt: new Date(Date.now() + 3600000).toISOString() }));
  assert.equal(scheduled.pending.length, 1);
  assert.equal(scheduled.plans[0].amount_vnd, 20000);

  await assert.rejects(sqlChange(change({ expectedVersion: 2 })), /Cancel existing schedule/);
  const cancelled = await sqlChange(change({
    action: 'CANCEL',
    expectedVersion: 2,
    amount: null,
    durationMonths: null,
    active: null,
    reason: 'Hủy lịch thay đổi giá Plus'
  }));
  assert.equal(cancelled.pending.length, 0);
  assert.equal(cancelled.plans[0].amount_vnd, 20000);

  await sqlChange(change({ expectedVersion: 3, effectiveAt: new Date(Date.now() + 3600000).toISOString(), amount: 45000 }));
  await db.exec("UPDATE user_plan_schedules SET effective_at=now()-interval '1 second' WHERE status='SCHEDULED'");
  const applied = await rpc('user_service_catalog');
  assert.equal(applied.plans[0].amount_vnd, 45000);
  assert.equal(applied.plans[0].version, 5);
});

test('pausing USER_PLUS hides it from public user catalog and blocks new checkouts', async () => {
  await sqlChange(change({ amount: 20000, durationMonths: 1, active: false }));
  const publicCatalog = await rpc('user_service_catalog');
  assert.deepEqual(publicCatalog.plans, []);
  await assert.rejects(reserve(1, 2), /Plan unavailable/);

  const adminCatalog = await rpc('admin_user_plan_catalog', [2]);
  assert.equal(adminCatalog.plans.length, 1);
  assert.equal(adminCatalog.plans[0].active, false);
});

test('non-admin actors and browser DB roles cannot mutate or read USER_PLUS schedules/audit', async () => {
  for (const actor of [1, 3, 4, 9, 999]) {
    await assert.rejects(rpc('admin_user_plan_catalog', [actor]), /Admin required/);
    await assert.rejects(sqlChange(change(), actor), /Admin required/);
    await assert.rejects(rpc('admin_user_plan_history', [actor, 1, 10]), /Admin required/);
  }
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      for (const table of ['user_billing_plans', 'user_plan_schedules', 'user_plan_audit']) {
        await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
      }
      await assert.rejects(rpc('admin_user_plan_catalog', [2]), /permission denied/);
      await assert.rejects(sqlChange(change()), /permission denied/);
      await assert.rejects(rpc('user_service_catalog'), /permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
  }
  await db.exec('SET ROLE service_role');
  try {
    await assert.rejects(db.exec("UPDATE user_billing_plans SET amount_vnd=1"), /permission denied/);
    await assert.rejects(db.exec('DELETE FROM user_plan_audit'), /permission denied/);
  } finally {
    await db.exec('RESET ROLE');
  }
});

test('production admin routes, services and userPaymentRepository enforce auth and share SQL catalog', async () => {
  const express = require('express');
  const jwt = require('jsonwebtoken');
  const { getJwtConfig } = require('../services/authSessionService');
  const restore = connectBillingDatabase(supabase, db);
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/admin', require('../routes/adminRoutes'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/service-plans/user`;
  const token = async (id) => {
    const sid = randomUUID();
    await db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sid, id]);
    const { secret, issuer, audience } = getJwtConfig();
    return jwt.sign({ token_use: 'access', sid }, secret, { algorithm: 'HS256', subject: String(id), issuer, audience, expiresIn: '1h' });
  };

  try {
    for (const route of ['', '/history']) {
      assert.equal((await fetch(base + route)).status, 401);
    }
    for (const id of [1, 3, 4, 9]) {
      const headers = { Authorization: `Bearer ${await token(id)}`, 'Content-Type': 'application/json' };
      assert.equal((await fetch(base, { headers })).status, 403);
      assert.equal((await fetch(base + '/paid', { method: 'POST', headers, body: JSON.stringify(change()) })).status, 403);
    }

    const headers = { Authorization: `Bearer ${await token(2)}`, 'Content-Type': 'application/json' };
    const catalogRes = await fetch(base, { headers });
    assert.equal(catalogRes.status, 200);
    assert.equal(catalogRes.headers.get('cache-control'), 'no-store');
    assert.equal((await catalogRes.json()).plans[0].amount_vnd, 20000);

    // Reject Agent plan codes on user plan endpoint
    const badCodeRes = await fetch(base + '/paid', {
      method: 'POST',
      headers,
      body: JSON.stringify(change({ planCode: 'LITE' }))
    });
    assert.equal(badCodeRes.status, 400);

    appCache.set('plans:user-plus', [{ code: 'USER_PLUS', amount_vnd: 20000 }], 60000);
    const updateRes = await fetch(base + '/paid', {
      method: 'POST',
      headers,
      body: JSON.stringify(change())
    });
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json()).plans[0].amount_vnd, 35000);
    assert.equal(appCache.get('plans:user-plus'), undefined, 'Updating USER_PLUS must invalidate cached user plans');

    const userCatalog = await userPaymentRepository.plans();
    assert.equal(userCatalog.length, 1);
    assert.equal(userCatalog[0].amount_vnd, 35000);
    assert.equal(userCatalog[0].duration_months, 2);

    const payment = createPaymentService(userPaymentRepository, { availability: () => ({ available: true }) });
    await assert.rejects(
      payment.create(1, { planCode: 'USER_PLUS', requestId: randomUUID(), planVersion: 1 }),
      { statusCode: 409, code: 'PLAN_PRICE_CHANGED' }
    );

    const historyRes = await fetch(base + '/history?page=1&limit=10', { headers });
    assert.equal(historyRes.status, 200);
    const historyBody = await historyRes.json();
    assert.equal(historyBody.total, 1);
    assert.equal(historyBody.items[0].plan_code, 'USER_PLUS');
    assert.equal(historyBody.items[0].after_config.amount_vnd, 35000);
    assert.equal((await adminService.userHistory(2, { page: '1', limit: '10' })).total, 1);
  } finally {
    restore();
    await new Promise(resolve => server.close(resolve));
  }
});
