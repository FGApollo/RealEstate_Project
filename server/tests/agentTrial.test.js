// Dùng thử Lite 1 tháng (migration 027): mỗi tài khoản một lần, chỉ khi chưa từng có kỳ gói nào.
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createTierDatabase } = require('./helpers/tierDatabase');
const { connectBillingDatabase } = require('./helpers/billingDatabase');
const { supabase } = require('../config/supabase');
const subscriptionService = require('../services/subscriptionService');

let db;
const migration = (name) => fs.readFileSync(path.join(__dirname, '../db-migration', name), 'utf8');
const rpc = async (name, args = []) => (await db.query(`SELECT ${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) data`, args)).rows[0].data;
const buy = async (code, user = 9) => {
  const order = await rpc('reserve_agent_payment', [user, code, randomUUID(), 1]);
  return rpc('settle_agent_payment', [order.order_code, randomUUID().replaceAll('-', ''), order.amount_vnd, new Date().toISOString(), 'fixture']);
};
const periods = async (user = 9) => (await db.query(`SELECT plan_name, support_tier, status, source, price_vnd::int AS price,
    listing_limit, priority_points, ended_reason,
    start_date <= (now() AT TIME ZONE 'UTC') AND end_date > (now() AT TIME ZONE 'UTC') AS running,
    start_date > (now() AT TIME ZONE 'UTC') AS queued, start_date, end_date
  FROM seller_subscriptions WHERE user_id = $1 ORDER BY id`, [user])).rows;

before(async () => {
  db = await createTierDatabase();
  await db.exec(migration('020-schema-migration-ledger.sql'));
  await db.exec(migration('023-agent-subscription-management.sql'));
  await db.exec(migration('027-agent-lite-free-trial.sql'));
  await db.exec(migration('027-agent-lite-free-trial.sql')); // chạy lại phải an toàn
});
beforeEach(async () => {
  await db.exec(`TRUNCATE users CASCADE;
    INSERT INTO users(id,name,email,role,verification_status) VALUES
      (9,'Agent Nine','nine@example.test','AGENT','VERIFIED'),(10,'Agent Ten','ten@example.test','AGENT','VERIFIED'),
      (12,'Customer','customer@example.test','USER','VERIFIED');
    UPDATE agent_billing_plans SET version=1,active=code IN ('LITE','PLUS','PRO'),duration_months=1,
      amount_vnd=CASE code WHEN 'LITE' THEN 349000 WHEN 'PLUS' THEN 499000 WHEN 'PRO' THEN 999000 ELSE 1000000 END;`);
});
after(async () => db?.close());

test('a new agent gets one free month with the current Lite benefits, only once', async () => {
  assert.equal(await rpc('agent_trial_available', [9]), true);
  await rpc('start_agent_free_trial', [9]);
  const [trial] = await periods();
  assert.deepEqual([trial.plan_name, trial.source, trial.price, trial.support_tier, trial.listing_limit, trial.priority_points, trial.running],
    ['FREE_TRIAL', 'TRIAL', 0, 'LITE', 10, 100, true]);
  const days = (new Date(trial.end_date) - new Date(trial.start_date)) / 86400000;
  assert.ok(days >= 28 && days <= 31, `trial lasts one month, got ${days} days`);
  assert.equal(await rpc('agent_trial_available', [9]), false);
  await assert.rejects(rpc('start_agent_free_trial', [9]), /Trial not available/);
  assert.equal((await periods()).length, 1);
});

test('agents who already had any plan cannot start a trial', async () => {
  await buy('LITE', 10);
  assert.equal(await rpc('agent_trial_available', [10]), false);
  await assert.rejects(rpc('start_agent_free_trial', [10]), /Trial not available/);
  await db.exec("UPDATE seller_subscriptions SET status='EXPIRED', end_date=now() AT TIME ZONE 'UTC' WHERE user_id=10");
  await assert.rejects(rpc('start_agent_free_trial', [10]), /Trial not available/);
});

test('only active agents can start a trial, and not while Lite is withdrawn from sale', async () => {
  await assert.rejects(rpc('start_agent_free_trial', [12]), /Agent unavailable/);
  await db.exec("UPDATE agent_billing_plans SET active=false WHERE code='LITE'");
  assert.equal(await rpc('agent_trial_available', [9]), false);
  await assert.rejects(rpc('start_agent_free_trial', [9]), /Lite plan unavailable/);
  assert.equal((await periods()).length, 0);
});

test('buying Lite during the trial queues after it; buying Pro upgrades immediately', async () => {
  await rpc('start_agent_free_trial', [9]);
  await buy('LITE');
  let rows = await periods();
  assert.deepEqual(rows.map((row) => [row.plan_name, row.running, row.queued]), [['FREE_TRIAL', true, false], ['LITE', false, true]]);
  await buy('PRO');
  rows = await periods();
  assert.deepEqual(rows.map((row) => [row.plan_name, row.status, row.running]),
    [['FREE_TRIAL', 'EXPIRED', false], ['LITE', 'ACTIVE', false], ['PRO', 'ACTIVE', true]]);
  assert.equal(rows[0].ended_reason, 'UPGRADED');
});

test('the API service starts the trial once and explains why a second attempt is refused', async () => {
  const restore = connectBillingDatabase(supabase, db);
  try {
    assert.equal((await subscriptionService.getTrialStatus(9)).available, true);
    const subscription = await subscriptionService.startFreeTrial(9);
    assert.deepEqual([subscription.plan_name, subscription.effective_status, subscription.listing_limit], ['FREE_TRIAL', 'ACTIVE', 10]);
    assert.equal((await subscriptionService.getTrialStatus(9)).available, false);
    await assert.rejects(subscriptionService.startFreeTrial(9), (error) => error.statusCode === 409 && /đã dùng thử/.test(error.message));
    await assert.rejects(subscriptionService.startFreeTrial(12), (error) => error.statusCode === 403);
  } finally { restore(); }
});
