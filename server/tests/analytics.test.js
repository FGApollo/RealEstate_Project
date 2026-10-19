process.env.SUPABASE_URL = 'https://analytics-tests.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-test-key';
process.env.JWT_SECRET = 'isolated-analytics-test-secret-over-32-characters';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createAnalyticsDatabase, seedAnalyticsDatabase, queryDashboard, connectTestDatabase } = require('./helpers/analyticsDatabase');
const { parseAnalyticsQuery, parsePagination } = require('../services/analyticsQuery');
const service = require('../services/analyticsService');
const { supabase } = require('../config/supabase');
const { getJwtConfig } = require('../services/authSessionService');
const adminRoutes = require('../routes/adminRoutes');
let db;
let server;
let base;
let restore;

before(async () => {
  db = await createAnalyticsDatabase();
  restore = connectTestDatabase(supabase, db);
  const app = express();
  app.use('/api/admin', adminRoutes);
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/admin`;
});
beforeEach(async () => seedAnalyticsDatabase(db));
after(async () => {
  restore?.();
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.close();
});

test('real PostgreSQL: 8 USER + 4 AGENT = 12, including disabled accounts', async () => {
  const result = await queryDashboard(db);
  assert.equal(result.users.total, 12);
  assert.equal(result.users.customers, 8);
  assert.equal(result.users.agents, 4);
  assert.equal(result.users.active, 11);
  assert.equal(result.users.inactive, 1);
  assert.equal(result.users.newAccounts, 6);
  assert.equal(result.users.newGrowthPercent, null);
  assert.equal(result.users.openingTotal, 6);
  assert.equal(result.users.totalGrowthPercent, 100);
  assert.equal(result.users.customerShare + result.users.agentShare, 100);
});

test('renewals/overlaps count unique agents and select the newest active plan', async () => {
  const result = await queryDashboard(db);
  assert.equal(result.subscriptions.records, 5);
  assert.equal(result.subscriptions.everSubscribed, 3);
  assert.equal(result.subscriptions.activeAgents, 2);
  assert.equal(result.subscriptions.neverSubscribed, 1);
  assert.equal(result.subscriptions.withoutActive, 2);
  assert.equal(result.subscriptions.newRecords, 3);
  assert.equal(result.subscriptions.expiredRecords, 1);
  assert.equal(result.subscriptions.cancelledRecords, 1);
  assert.deepEqual(result.packages.map((row) => [row.name, row.activeAgents, row.newSubscriptions, row.sharePercent]), [
    ['DB_PLAN_A', 1, 2, 50], ['DB_PLAN_B', 1, 1, 50]
  ]);
  assert.equal(result.packages.reduce((sum, row) => sum + row.activeAgents, 0), result.subscriptions.activeAgents);
  assert.equal(result.packages.reduce((sum, row) => sum + row.newSubscriptions, 0), result.subscriptions.newRecords);
});

test('subscription KPIs distinguish current users, previous signups and never-registered agents', async () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const result = await service.getDashboard({ start: '2026-10-10', end: '2026-10-16' }, now);
  assert.equal(result.subscriptions.activeAgents, 2);
  assert.equal(result.subscriptions.everSubscribed, 3);
  assert.equal(result.subscriptions.neverSubscribed, 1);
  assert.equal(result.subscriptions.withoutActive, 2);
  assert.equal(result.subscriptions.activeAgents + result.subscriptions.withoutActive, result.subscriptions.totalAgents);
  assert.equal(result.subscriptions.expiredRecords + result.subscriptions.cancelledRecords, 2);

  // A future or incomplete registration is still a registration, but is not
  // current usage. Multiple records and a disabled account do not add agents.
  await db.exec(`INSERT INTO seller_subscriptions(id,user_id,plan_name,status,start_date,end_date,created_at) VALUES
    (6,12,'FREE_TRIAL','ACTIVE','2026-10-17','2026-11-17','2026-10-11'),
    (7,12,'INCOMPLETE','ACTIVE','2026-10-11',NULL,'2026-10-11');`);
  const future = await service.getDashboard({ start: '2026-10-10', end: '2026-10-16' }, now);
  assert.equal(future.subscriptions.activeAgents, 2);
  assert.equal(future.subscriptions.everSubscribed, 4);
  assert.equal(future.subscriptions.neverSubscribed, 0);
  assert.equal(future.subscriptions.withoutActive, 2);
  assert.equal(future.packages.reduce((sum, item) => sum + item.activeAgents, 0), future.subscriptions.activeAgents);

  await db.exec("UPDATE seller_subscriptions SET start_date='2026-10-15' WHERE id=6");
  const started = await service.getDashboard({ start: '2026-10-10', end: '2026-10-16' }, now);
  assert.equal(started.subscriptions.activeAgents, 3);
  assert.equal(started.packages.find((item) => item.name === 'FREE_TRIAL').activeAgents, 1);
  assert.equal(started.subscriptions.neverSubscribed, 0);
});

test('7/30-day filters reconcile KPI totals and growth chart across every bucket', async () => {
  for (const bucket of ['day', 'week', 'month', 'year']) {
    const seven = await queryDashboard(db, '2026-10-10', '2026-10-16', bucket);
    const thirty = await queryDashboard(db, '2026-09-17', '2026-10-16', bucket);
    assert.equal(seven.users.newAccounts, 6);
    assert.equal(thirty.users.newAccounts, 10);
    for (const result of [seven, thirty]) {
      assert.equal(result.userGrowth.reduce((sum, row) => sum + row.total, 0), result.users.newAccounts);
      assert.equal(result.userGrowth.reduce((sum, row) => sum + row.customers, 0), result.users.newCustomers);
      assert.equal(result.userGrowth.reduce((sum, row) => sum + row.agents, 0), result.users.newAgents);
    }
  }
});

test('Vietnam midnight is inclusive at start, exclusive at end; missing dates are visible', async () => {
  await db.exec(`UPDATE users SET created_at='2026-10-09 16:59:59.999' WHERE id=1;
    UPDATE users SET created_at='2026-10-09 17:00:00' WHERE id=2;
    UPDATE users SET created_at='2026-10-10 16:59:59.999' WHERE id=3;
    UPDATE users SET created_at='2026-10-10 17:00:00' WHERE id=4;
    UPDATE users SET created_at=NULL WHERE id=5;`);
  const result = await queryDashboard(db, '2026-10-10', '2026-10-10');
  assert.equal(result.users.newAccounts, 4); // customers 2/3 and agents 10/12
  assert.equal(result.users.unknownDates, 1);
  assert.equal(result.userGrowth[0].total, 4);
  assert.equal(result.userGrowth[0].customers, 2);
  assert.equal(result.userGrowth[0].agents, 2);
});

test('expired, future, missing expiry and non-Agent subscriptions cannot become active', async () => {
  await db.exec(`UPDATE seller_subscriptions SET end_date='2026-10-16 12:00:00' WHERE id=4;
    INSERT INTO seller_subscriptions (id,user_id,plan_name,status,start_date,end_date,created_at) VALUES
    (6,12,'FUTURE','ACTIVE','2026-10-17','2026-12-01','2026-10-11'),
    (7,12,'NO_EXPIRY','ACTIVE','2026-10-11',NULL,'2026-10-11'),
    (8,1,'WRONG_ROLE','ACTIVE','2026-10-11','2026-12-01','2026-10-11');`);
  const result = await queryDashboard(db);
  assert.equal(result.subscriptions.activeAgents, 1);
  assert.equal(result.subscriptions.expiredRecords, 2);
  assert.equal(result.subscriptions.unknownDates, 1);
  assert.ok(!result.packages.some((row) => row.name === 'WRONG_ROLE'));
});

test('plan names, zero-count plans and deterministic tie breaking come from DB', async () => {
  await db.exec(`INSERT INTO seller_subscriptions (id,user_id,plan_name,status,start_date,end_date,created_at) VALUES
    (20,9,'NEW_DYNAMIC_PLAN','ACTIVE','2026-10-11','2026-11-11','2026-10-11');`);
  const result = await queryDashboard(db);
  assert.equal(result.packages.find((row) => row.name === 'NEW_DYNAMIC_PLAN').activeAgents, 1);
  assert.equal(result.packages.find((row) => row.name === 'DB_PLAN_B').activeAgents, 0);
  assert.equal(result.packages.reduce((sum, row) => sum + row.sharePercent, 0), 100);
});

test('no payment ledger: money and transaction count are unknown, never inferred from PAID subscriptions', async () => {
  await db.exec(`UPDATE seller_subscriptions SET plan_name='PAID', price_vnd=999999999;`);
  const result = await service.getDashboard({ start: '2026-10-10', end: '2026-10-16' }, new Date('2026-10-16T12:00:00Z'));
  assert.equal(result.revenue.available, false);
  for (const key of ['totalGross', 'periodGross', 'periodNet', 'periodRefunds', 'successfulTransactions', 'averageTransaction']) assert.equal(result.revenue[key], null);
  assert.deepEqual(result.revenue.trend, []);
  assert.ok(result.packages.every((row) => row.revenue === null));
  assert.deepEqual(await service.getTransactions({ page: '2', limit: '10' }), {
    available: false, reason: 'Chưa có dữ liệu thanh toán xác thực', items: [], total: null, page: 2, limit: 10
  });
});

test('empty database returns safe aggregate zeros and a zero-filled series', async () => {
  await db.exec('TRUNCATE users CASCADE');
  const result = await queryDashboard(db);
  assert.equal(result.users.total, 0);
  assert.equal(result.subscriptions.activeAgents, 0);
  assert.deepEqual(result.packages, []);
  assert.equal(result.userGrowth.length, 7);
  assert.ok(result.userGrowth.every((row) => row.total === 0));
});

test('date validation handles leap dates, local today, query arrays, injection, oversized ranges and pagination', () => {
  const now = new Date('2026-10-15T18:00:00Z'); // Oct 16 in Vietnam
  assert.equal(parseAnalyticsQuery({ preset: '7d' }, now).end, '2026-10-16');
  assert.equal(parseAnalyticsQuery({ preset: '12m' }, now).start, '2025-11-01');
  assert.equal(parseAnalyticsQuery({ start: '2024-02-29', end: '2024-02-29' }, now).days, 1);
  for (const query of [
    { start: '2026-02-29', end: '2026-03-01' }, { start: '2026-10-17', end: '2026-10-17' },
    { start: '2026-10-10', end: '2026-10-01' }, { start: '2000-01-01', end: '2026-10-01' },
    { start: '2020-01-01', end: '2026-10-01', bucket: 'day' }, { preset: ['7d', '30d'] },
    { bucket: "day'); DROP TABLE users;--" }, { adminId: '1' }, { preset: '7d', start: '2026-10-01' }
  ]) assert.throws(() => parseAnalyticsQuery(query, now), (error) => error.statusCode === 400);
  for (const query of [{ page: '0' }, { limit: '51' }, { page: ['1'] }, { offset: '4' }]) assert.throws(() => parsePagination(query));
});

async function tokenFor(id, role = 'ADMIN', active = true) {
  if (role === 'ADMIN') {
    await db.query(`INSERT INTO users (id,name,role,is_active,created_at) VALUES ($1,'Test Admin',$2,$3,'2026-01-01') ON CONFLICT (id) DO UPDATE SET role=$2,is_active=$3`, [id, role, active]);
  }
  const sid = crypto.randomUUID();
  await db.query('INSERT INTO auth_sessions (id,user_id,expires_at) VALUES ($1,$2,$3)', [sid, id, new Date(Date.now() + 60000).toISOString()]);
  const { secret, issuer, audience } = getJwtConfig();
  return jwt.sign({ token_use: 'access', sid }, secret, { algorithm: 'HS256', subject: String(id), issuer, audience, expiresIn: '1m' });
}

test('HTTP authentication: guest 401, USER/AGENT 403, active ADMIN 200 with real JWT/session/SQL', async () => {
  for (const path of ['/analytics/overview', '/analytics/transactions']) {
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    for (const id of [1, 9]) {
      const token = await tokenFor(id, id === 1 ? 'USER' : 'AGENT');
      assert.equal((await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status, 403);
    }
    const token = await tokenFor(99);
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    if (path.endsWith('overview')) {
      assert.equal(body.users.total, 13);
      assert.equal(body.revenue.available, false);
      for (const forbidden of ['email', 'password', 'phone', 'accessToken', 'refresh_token_hash']) assert.ok(!Object.hasOwn(body, forbidden));
    } else assert.equal(body.total, null);
  }
});

test('HTTP rejects disabled Admin, changed role, revoked session, tampered token, and spoofed identity', async () => {
  const token = await tokenFor(99);
  const headers = { Authorization: `Bearer ${token}` };
  await db.exec('UPDATE users SET is_active=false WHERE id=99');
  assert.equal((await fetch(`${base}/analytics/overview`, { headers })).status, 403);
  await db.exec('UPDATE users SET is_active=NULL WHERE id=99');
  assert.equal((await fetch(`${base}/analytics/overview`, { headers })).status, 403);
  await db.exec("UPDATE users SET is_active=true,role='USER' WHERE id=99");
  assert.equal((await fetch(`${base}/analytics/overview`, { headers })).status, 403);
  await db.exec("UPDATE users SET role='ADMIN' WHERE id=99; UPDATE auth_sessions SET revoked_at=now() WHERE user_id=99");
  assert.equal((await fetch(`${base}/analytics/overview`, { headers })).status, 401);
  assert.equal((await fetch(`${base}/analytics/overview`, { headers: { Authorization: `Bearer ${token}tampered` } })).status, 401);
  const valid = await tokenFor(99);
  const response = await fetch(`${base}/analytics/overview?adminId=99`, { headers: { Authorization: `Bearer ${valid}` } });
  assert.equal(response.status, 400);
});

test('database RPC rejects anon/authenticated execute and enforces bounds on direct calls', async () => {
  const { rows } = await db.query(`SELECT
    has_function_privilege('anon','admin_analytics_dashboard(date,date,text,timestamptz)','EXECUTE') AS anon,
    has_function_privilege('authenticated','admin_analytics_dashboard(date,date,text,timestamptz)','EXECUTE') AS authenticated,
    has_function_privilege('service_role','admin_analytics_dashboard(date,date,text,timestamptz)','EXECUTE') AS service`);
  assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true });
  await assert.rejects(queryDashboard(db, '2026-02-01', '2026-01-01'), /Invalid analytics/);
  await assert.rejects(queryDashboard(db, '2020-01-01', '2026-10-01', 'day'), /Invalid analytics/);
});

test('missing migration and query failures return actionable safe errors, without fake zeros', async () => {
  const original = supabase.rpc;
  try {
    supabase.rpc = async () => ({ error: { code: 'PGRST202', message: 'internal schema detail' } });
    await assert.rejects(service.getDashboard({}), (error) => error.statusCode === 503 && error.code === 'ANALYTICS_NOT_CONFIGURED');
    supabase.rpc = async () => ({ error: { code: 'XX000', message: 'secret database details' } });
    await assert.rejects(service.getDashboard({}), (error) => error.statusCode === 500 && !error.message.includes('secret'));
  } finally { supabase.rpc = original; }
});

test('existing moderation routes retain backend Admin guards', async () => {
  for (const path of ['/reviews', '/trust-score-logs']) {
    assert.equal((await fetch(`${base}${path}`)).status, 401);
    const token = await tokenFor(1, 'USER');
    assert.equal((await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } })).status, 403);
  }
});

test('large fixture uses indexed date/active lookups and keeps aggregated response bounded', async (t) => {
  await db.exec(`
    INSERT INTO users (id,role,created_at)
    SELECT n, 'AGENT', timestamp '2020-01-01' + (n % 1000) * interval '1 day'
    FROM generate_series(1000,30999) n;
    INSERT INTO seller_subscriptions (id,user_id,plan_name,status,start_date,end_date,created_at)
    SELECT n, 1000 + (n % 30000), 'PERF_PLAN_' || (n % 4),
      CASE WHEN n % 100 = 0 THEN 'ACTIVE' ELSE 'EXPIRED' END,
      timestamp '2020-01-01' + (n % 1000) * interval '1 day',
      CASE WHEN n % 100 = 0 THEN timestamp '2027-01-01' ELSE timestamp '2023-01-01' END,
      timestamp '2020-01-01' + (n % 1000) * interval '1 day'
    FROM generate_series(1000,60999) n;
    ANALYZE users; ANALYZE seller_subscriptions;
  `);
  const { rows: datePlan } = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT date_trunc('day', created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh'), count(*)
    FROM users WHERE created_at >= timestamp '2026-10-09 17:00:00' AND created_at < timestamp '2026-10-16 12:00:00'
    GROUP BY 1`);
  assert.match(JSON.stringify(datePlan), /users_analytics_created_role_idx/);
  const { rows: activePlan } = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON)
    SELECT DISTINCT ON (s.user_id) s.user_id, s.plan_name
    FROM seller_subscriptions s JOIN users u ON u.id=s.user_id AND u.role='AGENT'
    WHERE s.status='ACTIVE' AND s.start_date < timestamp '2026-10-16 12:00:00'
      AND s.end_date > timestamp '2026-10-16 12:00:00'
      AND (s.created_at < timestamp '2026-10-16 12:00:00' OR s.created_at IS NULL)
      AND (u.created_at < timestamp '2026-10-16 12:00:00' OR u.created_at IS NULL)
    ORDER BY s.user_id,s.start_date DESC,s.created_at DESC NULLS LAST,s.id DESC`);
  assert.match(JSON.stringify(activePlan), /subscriptions_analytics_current_idx/);
  const start = performance.now();
  const result = await queryDashboard(db);
  const elapsed = performance.now() - start;
  assert.equal(result.users.total, 30012);
  assert.equal(result.subscriptions.records, 60005);
  assert.equal(result.userGrowth.length, 7);
  assert.ok(JSON.stringify(result).length < 12000);
  assert.ok(elapsed < 8000);
  t.diagnostic(`30,012 accounts + 60,005 subscriptions: ${elapsed.toFixed(1)} ms, ${JSON.stringify(result).length} JSON characters; indexed growth and active-plan lookups verified. All-time totals intentionally scan applicable facts.`);
});
