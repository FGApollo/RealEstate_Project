process.env.SUPABASE_URL = 'https://isolated-plans.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-service-plan-test-key';
process.env.JWT_SECRET = 'isolated-service-plan-test-jwt-secret-over-32-bytes';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createBillingDatabase, connectBillingDatabase } = require('./helpers/billingDatabase');
const { supabase } = require('../config/supabase');
const adminService = require('../services/adminPlanService');
const paymentRepository = require('../repositories/paymentRepository');
const { createPaymentService } = require('../services/paymentService');
let db;
const rpc = async (name, args = []) => (await db.query(`SELECT public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) AS data`, args)).rows[0].data;
const change = (overrides = {}) => ({ action: 'SAVE', requestId: randomUUID(), expectedVersion: 1,
  amount: 1500000, durationMonths: 3, active: true, effectiveAt: null, reason: 'Chính sách giá mới', ...overrides });
const sqlChange = (body, actor = 2) => rpc('admin_change_agent_plan', [actor, body.requestId, body.expectedVersion,
  body.amount ?? null, body.durationMonths ?? null, body.active ?? null, body.effectiveAt ?? null, body.reason, body.action]);
const reserve = (user = 9, version = 1, request = randomUUID()) => rpc('reserve_agent_payment', [user, 'PAID', request, version]);
before(async () => { db = await createBillingDatabase(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE users CASCADE;
    INSERT INTO users(id,name,role) VALUES (1,'Customer','USER'),(2,'Admin','ADMIN'),(3,'Disabled Admin','ADMIN'),
      (4,'Unverified Admin','ADMIN'),(9,'Agent A','AGENT'),(10,'Agent B','AGENT');
    UPDATE users SET is_active=false WHERE id=3;
    UPDATE users SET email_verified_at=NULL WHERE id=4;
    UPDATE agent_billing_plans SET amount_vnd=1000000,duration_months=1,active=true,version=1;`);
});
after(async () => db?.close());

test('catalog uses DB prices and metadata; migration is repeatable and preserves configured prices', async () => {
  await sqlChange(change());
  await db.exec(fs.readFileSync(path.join(__dirname, '../db-migration/017-admin-service-plans.sql'), 'utf8'));
  const data = await rpc('admin_agent_plan_catalog', [2]);
  assert.equal(data.plans.length, 3);
  const paid = data.plans.find(plan => plan.code === 'PAID');
  assert.equal(paid.amount_vnd, 1500000); assert.equal(paid.duration_months, 3); assert.equal(paid.version, 2);
  assert.equal(data.plans.find(plan => plan.code === 'FREE_TRIAL').amount_vnd, 0);
  assert.equal(data.plans.find(plan => plan.code === 'ENTERPRISE').contact_url, null);
  assert.deepEqual(data.pending, []);
});

test('old orders preserve price/duration and settle correctly; fresh quotes must match the new version', async () => {
  const request = randomUUID(); const original = await reserve(9, 1, request);
  await sqlChange(change());
  await assert.rejects(reserve(10, 1), /Stale plan/);
  await assert.rejects(rpc('reserve_agent_payment', [10, 'PAID', randomUUID()]), /Stale plan/);
  const fresh = await reserve(10, 2);
  assert.equal(fresh.amount_vnd, 1500000); assert.equal(fresh.duration_months, 3);
  assert.equal((await reserve(9, 1, request)).id, original.id);
  const paid = await rpc('settle_agent_payment', [original.order_code, '1234567890abcdef1234567890abcdef',
    original.amount_vnd, new Date().toISOString(), 'isolated-test-reference']);
  assert.equal(paid.amount_vnd, 1000000); assert.equal(paid.duration_months, 1);
  assert.equal((await db.query('SELECT price_vnd FROM seller_subscriptions WHERE user_id=9')).rows[0].price_vnd, '1000000');
});

test('schedule leaves current price unchanged and applies exactly once at catalog read when due', async () => {
  const scheduled = await sqlChange(change({ effectiveAt: new Date(Date.now() + 3600000).toISOString() }));
  assert.equal(scheduled.pending.length, 1);
  assert.equal(scheduled.plans.find(plan => plan.code === 'PAID').amount_vnd, 1000000);
  await db.exec("UPDATE agent_plan_schedules SET effective_at=now()-interval '1 second'");
  const applied = await rpc('agent_service_catalog');
  assert.equal(applied.plans.find(plan => plan.code === 'PAID').amount_vnd, 1500000);
  assert.equal(applied.plans.find(plan => plan.code === 'PAID').version, 3);
  await rpc('agent_service_catalog');
  assert.equal(Number((await db.query("SELECT count(*) n FROM agent_plan_audit WHERE action='APPLIED'")).rows[0].n), 1);
});

test('a reservation applies due schedules without a prior catalog read and rejects the stale quote', async () => {
  await sqlChange(change({ effectiveAt: new Date(Date.now() + 3600000).toISOString() }));
  await db.exec("UPDATE agent_plan_schedules SET effective_at=now()-interval '1 second'");
  // A rejected statement rolls back its attempted application; the next catalog
  // read/new reservation still applies the due schedule before selecting a price.
  await assert.rejects(reserve(9, 2), /Stale plan/);
  const order = await reserve(9, 3);
  assert.equal(order.amount_vnd, 1500000); assert.equal(order.duration_months, 3);
});

test('pending schedules require cancellation and cancellation preserves the current price', async () => {
  await sqlChange(change({ effectiveAt: new Date(Date.now() + 3600000).toISOString() }));
  await assert.rejects(sqlChange(change({ expectedVersion: 2 })), /Cancel existing schedule/);
  const cancelled = await sqlChange(change({ action: 'CANCEL', expectedVersion: 2, amount: null,
    durationMonths: null, active: null, reason: 'Hủy lịch theo chính sách' }));
  assert.equal(cancelled.pending.length, 0);
  assert.equal(cancelled.plans.find(plan => plan.code === 'PAID').amount_vnd, 1000000);
  assert.equal(cancelled.plans.find(plan => plan.code === 'PAID').version, 3);
  assert.equal((await db.query("SELECT status FROM agent_plan_schedules")).rows[0].status, 'CANCELLED');
});

test('optimistic concurrency and request idempotency prevent lost updates and duplicate audit entries', async () => {
  const body = change(); await sqlChange(body); await sqlChange(body);
  assert.equal(Number((await db.query('SELECT count(*) n FROM agent_plan_audit')).rows[0].n), 1);
  await assert.rejects(sqlChange(change()), /Stale plan/);
  await assert.rejects(sqlChange({ ...body, amount: 3000000 }), /Request reused/);
  const result = await sqlChange(change({ expectedVersion: 2, amount: 2000000 }));
  assert.equal(result.plans.find(plan => plan.code === 'PAID').amount_vnd, 2000000);
});

test('pausing a plan blocks new orders while allowing existing pending orders and paid grants', async () => {
  const old = await reserve();
  await sqlChange(change({ amount: 1000000, durationMonths: 1, active: false }));
  await assert.rejects(reserve(10, 2), /Plan unavailable/);
  assert.equal((await reserve()).id, old.id);
  const paid = await rpc('settle_agent_payment', [old.order_code, '1234567890abcdef1234567890abcdef', old.amount_vnd, new Date().toISOString(), 'test']);
  assert.equal(paid.status, 'PAID');
});

test('non-admin, disabled and unverified actors are rejected by SQL as well as HTTP', async () => {
  for (const actor of [1, 3, 4, 9, 999]) {
    await assert.rejects(rpc('admin_agent_plan_catalog', [actor]), /Admin required/);
    await assert.rejects(sqlChange(change(), actor), /Admin required/);
    await assert.rejects(rpc('admin_agent_plan_history', [actor, 1, 10]), /Admin required/);
  }
  assert.equal(Number((await db.query('SELECT count(*) n FROM agent_plan_audit')).rows[0].n), 0);
});

test('browser database roles cannot read pricing administration or execute its SQL functions', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`SET ROLE ${role}`);
    try {
      for (const table of ['agent_service_packages','agent_plan_schedules','agent_plan_audit']) await assert.rejects(db.query(`SELECT * FROM ${table}`), /permission denied/);
      await assert.rejects(rpc('admin_agent_plan_catalog', [2]), /permission denied/);
      await assert.rejects(sqlChange(change()), /permission denied/);
      await assert.rejects(rpc('agent_service_catalog'), /permission denied/);
      await assert.rejects(rpc('apply_due_agent_plan_changes'), /permission denied/);
    } finally { await db.exec('RESET ROLE'); }
  }
  await db.exec('SET ROLE service_role');
  try {
    assert.equal((await rpc('admin_agent_plan_catalog', [2])).plans.length, 3);
    await assert.rejects(db.exec('UPDATE agent_billing_plans SET amount_vnd=1'), /permission denied/);
    await assert.rejects(db.exec('DELETE FROM agent_plan_audit'), /permission denied/);
  } finally { await db.exec('RESET ROLE'); }
});

test('audit history is paginated, includes actor and reason and never exposes request payloads', async () => {
  await sqlChange(change()); await sqlChange(change({ expectedVersion: 2, amount: 1800000 }));
  const page = await rpc('admin_agent_plan_history', [2, 1, 1]);
  assert.equal(page.total, 2); assert.equal(page.items.length, 1);
  assert.equal(page.items[0].actor_name, 'Admin'); assert.equal(page.items[0].after_config.amount_vnd, 1800000);
  assert.equal(page.items[0].request_payload, undefined);
  assert.equal(page.items[0].request_id, undefined);
  await assert.rejects(rpc('admin_agent_plan_history', [2, 0, 1000]), /Invalid pagination/);
});

test('backend rejects unknown fields, actor injection, malformed prices and timezone-free schedules before RPC', () => {
  for (const extra of [{ userId: 2 }, { amount: '1500000' }, { amount: 2000.1 }, { amount: 1 }, { amount: 500000001 },
    { durationMonths: 0 }, { active: 'true' }, { expectedVersion: 0 }, { expectedVersion: 2147483648 },
    { requestId: [randomUUID()] }, { effectiveAt: '2026-12-01T10:00' },
    { effectiveAt: new Date().toISOString() }, { effectiveAt: '2027-02-30T10:00:00+07:00' }, { reason: 'a' }, { action: 'UNSAFE' }]) {
    assert.throws(() => adminService.parseChange(change(extra)), { statusCode: 400 });
  }
  assert.equal(adminService.parseChange(change()).amount, 1500000);
});

test('production repositories and services share the SQL catalog and reject stale Agent checkout', async () => {
  const restore = connectBillingDatabase(supabase, db);
  try {
    const data = await adminService.change(2, change());
    assert.equal(data.plans.find(plan => plan.code === 'PAID').version, 2);
    assert.equal((await paymentRepository.plans()).find(plan => plan.code === 'PAID').amount_vnd, 1500000);
    const payment = createPaymentService(paymentRepository, { availability: () => ({ available: true }) });
    await assert.rejects(payment.create(9, { planCode: 'PAID', requestId: randomUUID(), planVersion: 1 }), { statusCode: 409, code: 'PLAN_PRICE_CHANGED' });
    await assert.rejects(payment.create(9, { planCode: 'PAID', requestId: randomUUID() }), { statusCode: 400 });
    assert.equal((await adminService.history(2, { page: '1', limit: '10' })).total, 1);
  } finally { restore(); }
});

test('HTTP enforces authenticated Admin, safe validation and paginated history through production routes', async () => {
  const express = require('express'); const jwt = require('jsonwebtoken');
  const { getJwtConfig } = require('../services/authSessionService');
  const restore = connectBillingDatabase(supabase, db);
  const app = express(); app.use(express.json({ limit: '32kb' })); app.use('/api/admin', require('../routes/adminRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/admin/service-plans`;
  const token = async id => {
    const sid = randomUUID(); await db.query("INSERT INTO auth_sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '1 hour')", [sid, id]);
    const { secret, issuer, audience } = getJwtConfig();
    return jwt.sign({ token_use: 'access', sid }, secret, { algorithm: 'HS256', subject: String(id), issuer, audience, expiresIn: '1h' });
  };
  try {
    for (const route of ['', '/history']) assert.equal((await fetch(base + route)).status, 401);
    for (const id of [1,3,4,9]) {
      const headers = { Authorization: `Bearer ${await token(id)}`, 'Content-Type': 'application/json' };
      assert.equal((await fetch(base, { headers })).status, 403);
      assert.equal((await fetch(base + '/paid', { method: 'POST', headers, body: JSON.stringify(change()) })).status, 403);
    }
    const headers = { Authorization: `Bearer ${await token(2)}`, 'Content-Type': 'application/json' };
    const catalog = await fetch(base, { headers }); assert.equal(catalog.status, 200); assert.equal(catalog.headers.get('cache-control'), 'no-store');
    const result = await fetch(base + '/paid', { method: 'POST', headers, body: JSON.stringify(change()) });
    assert.equal(result.status, 200); assert.equal((await result.json()).plans.find(plan => plan.code === 'PAID').amount_vnd, 1500000);
    assert.equal((await fetch(base + '/paid', { method: 'POST', headers, body: JSON.stringify(change()) })).status, 409);
    assert.equal((await fetch(base + '/history?page=1&limit=1', { headers })).status, 200);
    assert.equal((await fetch(base + '/history?limit=1000', { headers })).status, 400);
    assert.equal((await fetch(base + '/paid', { method: 'POST', headers, body: JSON.stringify(change({ actorId: 2 })) })).status, 400);
  } finally { restore(); await new Promise(resolve => server.close(resolve)); }
});
