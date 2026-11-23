const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTransactionAudience,
  getTransactionsWindowIso,
  normalizeTransactionRow
} = require('../services/transactionsAnalyticsLogic');

test('parseTransactionAudience accepts ALL/AGENT/USER case-insensitively and rejects invalid inputs', () => {
  assert.equal(parseTransactionAudience(undefined), 'ALL');
  assert.equal(parseTransactionAudience(''), 'ALL');
  assert.equal(parseTransactionAudience('all'), 'ALL');
  assert.equal(parseTransactionAudience('agent'), 'AGENT');
  assert.equal(parseTransactionAudience('USER'), 'USER');
  for (const invalid of ['ADMIN', 'CUSTOMER', ['AGENT'], 123]) {
    assert.throws(() => parseTransactionAudience(invalid), (err) => err.statusCode === 400);
  }
});

test('getTransactionsWindowIso computes Vietnam UTC+7 boundaries capped at now', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const window = getTransactionsWindowIso({ start: '2026-10-10', end: '2026-10-16' }, now);
  assert.equal(window.startIso, '2026-10-09T17:00:00.000Z');
  assert.equal(window.cutoffIso, '2026-10-16T12:00:00.000Z');

  const pastWindow = getTransactionsWindowIso({ start: '2026-10-10', end: '2026-10-12' }, now);
  assert.equal(pastWindow.cutoffIso, '2026-10-12T17:00:00.000Z');
});

test('normalizeTransactionRow classifies AGENT vs USER orders and preserves account metadata', () => {
  const usersById = new Map([
    [1, { id: 1, name: 'Minh Khue', email: 'khue@test.vn', role: 'USER' }],
    [9, { id: 9, name: '   ', email: 'agent9@test.vn', role: 'AGENT' }]
  ]);
  const userOrder = normalizeTransactionRow({
    id: 'u-1',
    order_code: 1000000000025,
    user_id: 1,
    plan_code: 'USER_PLUS',
    plan_name: 'Swipe Nest Plus',
    amount_vnd: 20000,
    currency: 'VND',
    status: 'PAID',
    audience: 'USER',
    created_at: '2026-10-12T04:00:00Z',
    paid_at: '2026-10-12T04:01:00Z'
  }, usersById);
  assert.equal(userOrder.audience, 'USER');
  assert.equal(userOrder.accountName, 'Minh Khue');
  assert.equal(userOrder.accountEmail, 'khue@test.vn');
  assert.equal(userOrder.amount, 20000);

  const agentOrder = normalizeTransactionRow({
    id: 'a-1',
    order_code: 1000000000026,
    user_id: 9,
    plan_code: 'PRO',
    plan_name: 'Pro',
    amount_vnd: 299000,
    currency: 'VND',
    status: 'PENDING',
    audience: 'AGENT',
    created_at: '2026-10-13T04:00:00Z',
    paid_at: null
  }, usersById);
  assert.equal(agentOrder.audience, 'AGENT');
  assert.equal(agentOrder.accountName, 'Môi giới');
  assert.equal(agentOrder.paidAt, null);
});
