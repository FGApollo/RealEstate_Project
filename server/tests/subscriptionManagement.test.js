const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTierDatabase } = require('./helpers/tierDatabase');

let db;
const migration = (name) => fs.readFileSync(path.join(__dirname, '../db-migration', name), 'utf8');
const rpc = async (name, args = []) => (await db.query(`SELECT ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) data`, args)).rows[0].data;
const buy = async (code, user = 9) => {
  const order = await rpc('reserve_agent_payment', [user, code, randomUUID(), 1]);
  return rpc('settle_agent_payment', [order.order_code, randomUUID().replaceAll('-', ''), order.amount_vnd, new Date().toISOString(), 'fixture']);
};
const periods = async (user = 9) => (await db.query(`SELECT id, plan_name, support_tier, status, source, ended_reason, price_vnd::int AS price,
    start_date <= (now() AT TIME ZONE 'UTC') AND end_date > (now() AT TIME ZONE 'UTC') AS running,
    start_date > (now() AT TIME ZONE 'UTC') AS queued, start_date, end_date
  FROM seller_subscriptions WHERE user_id = $1 ORDER BY id`, [user])).rows;
const seconds = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 1000;

before(async () => {
  db = await createTierDatabase();
  await db.exec(migration('020-schema-migration-ledger.sql'));
  await db.exec(migration('023-agent-subscription-management.sql'));
  // Chạy lại lần hai phải an toàn.
  await db.exec(migration('023-agent-subscription-management.sql'));
});
beforeEach(async () => {
  await db.exec(`TRUNCATE users CASCADE;
    INSERT INTO users(id,name,email,role,verification_status) VALUES
      (2,'Admin','admin@example.test','ADMIN','VERIFIED'),(9,'Agent Nine','Nine@Example.test','AGENT','VERIFIED'),
      (10,'Agent Ten','ten@example.test','AGENT','VERIFIED'),(12,'Customer','customer@example.test','USER','VERIFIED');
    UPDATE agent_billing_plans SET version=1,active=code IN ('LITE','PLUS','PRO'),duration_months=1,
      amount_vnd=CASE code WHEN 'LITE' THEN 349000 WHEN 'PLUS' THEN 499000 WHEN 'PRO' THEN 999000 ELSE 1000000 END;`);
});
after(async () => db?.close());

test('first purchase starts now; same-tier renewal queues after the running period', async () => {
  const first = await buy('LITE');
  assert.equal(first.status, 'PAID');
  await buy('LITE');
  const rows = await periods();
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[0].running, rows[0].queued, rows[1].running, rows[1].queued], [true, false, false, true]);
  assert.ok(seconds(rows[1].start_date, rows[0].end_date) < 1);
  assert.equal(rows[0].source, 'PAYOS');
});

test('upgrade takes effect immediately at full price, drops the old remainder and shifts queued periods', async () => {
  await buy('LITE');
  await buy('LITE');
  const before = await periods();
  const queuedLength = seconds(before[1].end_date, before[1].start_date);

  const order = await buy('PRO');
  assert.equal(order.amount_vnd, 999000);
  const rows = await periods();
  const [oldLite, queuedLite, pro] = rows;
  assert.deepEqual([oldLite.status, oldLite.ended_reason, oldLite.running], ['EXPIRED', 'UPGRADED', false]);
  assert.deepEqual([pro.support_tier, pro.running, pro.status], ['PRO', true, 'ACTIVE']);
  // The order records the period it bought (compared in SQL: one side is timestamptz, the other UTC timestamp).
  const grant = (await db.query(`SELECT o.subscription_id,
      abs(extract(epoch FROM o.grant_start - (s.start_date AT TIME ZONE 'UTC'))) < 1
      AND abs(extract(epoch FROM o.grant_end - (s.end_date AT TIME ZONE 'UTC'))) < 1 AS matches
    FROM agent_payment_orders o JOIN seller_subscriptions s ON s.id = o.subscription_id WHERE o.id = $1`, [order.id])).rows[0];
  assert.deepEqual(grant, { subscription_id: pro.id, matches: true });
  // The already-paid queued Lite period is kept: it now follows the Pro period with the same length.
  assert.deepEqual([queuedLite.status, queuedLite.queued], ['ACTIVE', true]);
  assert.ok(seconds(queuedLite.start_date, pro.end_date) < 1);
  assert.ok(Math.abs(seconds(queuedLite.end_date, queuedLite.start_date) - queuedLength) < 1);

  const state = await rpc('agent_subscription_state', [9]);
  assert.equal(state.support_tier, 'PRO');
  assert.equal(state.listing_limit, 50);
  assert.equal(state.upcoming.length, 1);
});

test('downgrade is paid now but waits until the running period ends', async () => {
  await buy('PRO');
  await buy('LITE');
  const [pro, lite] = await periods();
  assert.deepEqual([pro.running, pro.status, pro.ended_reason], [true, 'ACTIVE', null]);
  assert.deepEqual([lite.queued, lite.support_tier], [true, 'LITE']);
  assert.ok(seconds(lite.start_date, pro.end_date) < 1);
  assert.equal((await rpc('agent_subscription_state', [9])).support_tier, 'PRO');
});

test('agent cancel removes only queued periods, needs a reason and is audited', async () => {
  await buy('PLUS');
  await buy('PLUS');
  await buy('LITE');
  await assert.rejects(rpc('agent_cancel_queued_periods', [9, 'no']), /Invalid reason/);
  await assert.rejects(rpc('agent_cancel_queued_periods', [12, 'Khách hàng không phải môi giới']), /Agent unavailable/);
  const result = await rpc('agent_cancel_queued_periods', [9, 'Không cần gia hạn nữa']);
  assert.equal(result.cancelled, 2);
  const rows = await periods();
  assert.deepEqual(rows.map((row) => [row.status, row.ended_reason]), [['ACTIVE', null], ['CANCELLED', 'AGENT_CANCELLED'], ['CANCELLED', 'AGENT_CANCELLED']]);
  assert.equal(rows[0].running, true);
  assert.equal((await rpc('agent_cancel_queued_periods', [9, 'Gọi lại lần hai'])).cancelled, 0);
  const audit = (await db.query('SELECT action, actor_id, reason FROM agent_subscription_audit')).rows;
  assert.deepEqual(audit, [{ action: 'CANCELLED_QUEUED', actor_id: 9, reason: 'Không cần gia hạn nữa' }]);
  // Paid orders stay PAID: there is no in-app refund.
  assert.equal(Number((await db.query("SELECT count(*) n FROM agent_payment_orders WHERE status='PAID'")).rows[0].n), 3);
});

test('admin grant follows the same rules, costs nothing, is idempotent and admin-only', async () => {
  const requestId = randomUUID();
  await assert.rejects(rpc('admin_grant_agent_plan', [9, randomUUID(), 10, 'LITE', 1, 'Agent tự cấp gói']), /Admin required/);
  await assert.rejects(rpc('admin_grant_agent_plan', [2, randomUUID(), 12, 'LITE', 1, 'Không phải môi giới']), /Agent not found/);
  await assert.rejects(rpc('admin_grant_agent_plan', [2, randomUUID(), 9, 'LITE', 13, 'Quá số tháng cho phép']), /Invalid plan/);
  await assert.rejects(rpc('admin_grant_agent_plan', [2, randomUUID(), 9, 'LITE', 1, 'x']), /Invalid request/);

  const state = await rpc('admin_grant_agent_plan', [2, requestId, 9, 'PLUS', 3, 'Cấp gói cho buổi demo']);
  assert.deepEqual([state.support_tier, state.listing_limit, state.source, Number(state.price_vnd)], ['PLUS', 20, 'ADMIN', 0]);
  await rpc('admin_grant_agent_plan', [2, requestId, 9, 'PLUS', 3, 'Cấp gói cho buổi demo']);
  let rows = await periods();
  assert.equal(rows.length, 1);
  assert.ok(Math.abs(seconds(rows[0].end_date, rows[0].start_date) / 86400 - 91) < 3);

  // Granting a higher tier upgrades immediately; a lower tier queues.
  await rpc('admin_grant_agent_plan', [2, randomUUID(), 9, 'PRO', 1, 'Nâng cấp cho demo']);
  await rpc('admin_grant_agent_plan', [2, randomUUID(), 9, 'LITE', 1, 'Xếp thêm một kỳ Lite']);
  rows = await periods();
  assert.deepEqual(rows.map((row) => [row.support_tier, row.status, row.running, row.queued]),
    [['PLUS', 'EXPIRED', false, false], ['PRO', 'ACTIVE', true, false], ['LITE', 'ACTIVE', false, true]]);
});

test('admin can change the running tier immediately and remove the plan; both are audited', async () => {
  await buy('LITE');
  await buy('LITE');
  const [running] = await periods();
  await assert.rejects(rpc('admin_change_agent_period', [2, randomUUID(), 10, 'PRO', 'Môi giới chưa có gói']), /No running period/);
  await assert.rejects(rpc('admin_change_agent_period', [2, randomUUID(), 9, 'LITE', 'Không có gì thay đổi']), /No changes/);

  const changed = await rpc('admin_change_agent_period', [2, randomUUID(), 9, 'PRO', 'Hỗ trợ môi giới demo']);
  assert.deepEqual([changed.support_tier, changed.listing_limit, changed.priority_points, changed.plan_name], ['PRO', 50, 300, 'PRO']);
  const afterChange = await periods();
  assert.ok(seconds(afterChange[0].end_date, running.end_date) < 1);
  assert.equal(afterChange[0].price, 349000);

  // Lowering also applies immediately.
  assert.equal((await rpc('admin_change_agent_period', [2, randomUUID(), 9, 'PLUS', 'Điều chỉnh lại hạng'])).support_tier, 'PLUS');

  const removeId = randomUUID();
  await rpc('admin_remove_agent_plan', [2, removeId, 9, 'Vi phạm chính sách']);
  await rpc('admin_remove_agent_plan', [2, removeId, 9, 'Vi phạm chính sách']);
  const rows = await periods();
  assert.deepEqual(rows.map((row) => [row.status, row.ended_reason, row.running]),
    [['CANCELLED', 'ADMIN_REMOVED', false], ['CANCELLED', 'ADMIN_REMOVED', false]]);
  await assert.rejects(rpc('admin_remove_agent_plan', [2, randomUUID(), 9, 'Không còn gói nào']), /No running period/);

  const lookup = await rpc('admin_agent_subscription', [2, null, ' nine@example.TEST ']);
  assert.equal(lookup.agent.id, 9);
  assert.deepEqual(lookup.audit.map((entry) => entry.action), ['REMOVED', 'CHANGED', 'CHANGED']);
  assert.ok(lookup.audit.every((entry) => !Object.hasOwn(entry, 'request_id')));
  await assert.rejects(rpc('admin_agent_subscription', [9, 9, null]), /Admin required/);
  await assert.rejects(rpc('admin_agent_subscription', [2, null, 'customer@example.test']), /Agent not found/);
});

test('browser roles cannot call the new functions or read the audit table', async () => {
  const granted = (await db.query(`SELECT p.proname, r.rolname FROM pg_proc p CROSS JOIN pg_roles r
    WHERE p.pronamespace = 'public'::regnamespace AND r.rolname IN ('anon','authenticated')
      AND p.proname IN ('agent_apply_period','agent_cancel_queued_periods','admin_grant_agent_plan','admin_change_agent_period',
        'admin_remove_agent_plan','admin_agent_subscription','admin_subscription_guard')
      AND has_function_privilege(r.oid, p.oid, 'EXECUTE')`)).rows;
  assert.deepEqual(granted, []);
  const tableAccess = (await db.query(`SELECT has_table_privilege('anon','agent_subscription_audit','SELECT') a,
    has_table_privilege('service_role','agent_subscription_audit','INSERT') b,
    has_function_privilege('service_role','agent_apply_period(integer,text,numeric,integer,integer,integer,text,text)','EXECUTE') c`)).rows[0];
  assert.deepEqual(tableAccess, { a: false, b: false, c: false });
});
