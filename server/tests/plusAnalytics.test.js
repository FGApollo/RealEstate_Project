const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getAnalyticsWindow,
  summarizePlusSubscriptions,
  buildActivePlusUsersPage
} = require('../services/plusAnalyticsLogic');

const makeUsersMap = (rows) => new Map(rows.map((u) => [u.id, u]));

test('summarizePlusSubscriptions counts stacked periods once per customer, tracks sources and revenue', () => {
  const now = new Date('2026-10-16T12:00:00Z');
  const window = getAnalyticsWindow({ start: '2026-10-10', end: '2026-10-16', days: 7 }, now, now.toISOString());
  const usersById = makeUsersMap([
    { id: 1, name: 'An', email: 'an@test.vn', role: 'USER', is_active: true, created_at: '2026-10-01 00:00:00' },
    { id: 2, name: 'Binh', email: 'binh@test.vn', role: 'USER', is_active: false, created_at: '2026-10-01 00:00:00' },
    { id: 3, name: 'Chi', email: 'chi@test.vn', role: 'USER', is_active: true, created_at: '2026-08-01 00:00:00' },
    { id: 4, name: 'Dung', email: 'dung@test.vn', role: 'USER', is_active: true, created_at: '2026-09-01 00:00:00' },
    { id: 9, name: 'Agent', email: 'agent@test.vn', role: 'AGENT', is_active: true, created_at: '2026-08-01 00:00:00' }
  ]);
  const subscriptions = [
    // Customer 1: stacked 2 active periods in period (PAYOS)
    { id: 1, user_id: 1, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-10-10T04:00:00Z', end_date: '2026-11-10T04:00:00Z', created_at: '2026-10-10T04:00:00Z' },
    { id: 2, user_id: 1, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-11-10T04:00:00Z', end_date: '2026-12-10T04:00:00Z', created_at: '2026-10-12T04:00:00Z' },
    // Customer 2: admin-granted active (account inactive still counted in entitlement)
    { id: 3, user_id: 2, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'ADMIN', start_date: '2026-10-11T04:00:00Z', end_date: '2026-11-05T04:00:00Z', created_at: '2026-10-11T04:00:00Z' },
    // Customer 3: expired in period, created in previous period (Oct 3-9)
    { id: 4, user_id: 3, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-10-05T00:00:00Z', end_date: '2026-10-14T00:00:00Z', created_at: '2026-10-05T00:00:00Z' },
    // Customer 4: cancelled
    { id: 5, user_id: 4, plan_code: 'USER_PLUS', status: 'CANCELLED', source: 'ADMIN', start_date: '2026-09-10T00:00:00Z', end_date: '2026-10-20T00:00:00Z', created_at: '2026-09-10T00:00:00Z' },
    // Non-customer (AGENT) must be excluded
    { id: 6, user_id: 9, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-10-10T00:00:00Z', end_date: '2026-11-10T00:00:00Z', created_at: '2026-10-10T00:00:00Z' }
  ];

  const summary = summarizePlusSubscriptions({
    subscriptions,
    usersById,
    plans: [{ code: 'USER_PLUS', name: 'Swipe Nest Plus' }],
    totalCustomers: 8,
    revenueByPackage: [
      { code: 'PRO', gross: 500000 },
      { code: 'USER_PLUS', gross: 40000 }
    ],
    window
  });

  assert.equal(summary.available, true);
  assert.equal(summary.totalCustomers, 8);
  assert.equal(summary.records, 5);
  assert.equal(summary.everSubscribed, 4);
  assert.equal(summary.activeUsers, 2);
  assert.equal(summary.neverSubscribed, 4);
  assert.equal(summary.withoutActive, 6);
  assert.equal(summary.adoptionRate, 25);
  assert.equal(summary.newRecords, 3);
  assert.equal(summary.previousNewRecords, 1);
  assert.equal(summary.newGrowthPercent, 200);
  assert.equal(summary.expiredRecords, 1);
  assert.equal(summary.cancelledRecords, 1);
  assert.equal(summary.endedInPeriod, 1);
  assert.equal(summary.periodRevenue, 40000);
  assert.deepEqual(summary.sources.map((s) => [s.code, s.activeUsers, s.newSubscriptions, s.sharePercent]), [
    ['PAYOS', 1, 2, 50],
    ['ADMIN', 1, 1, 50]
  ]);
});

test('buildActivePlusUsersPage aggregates stacked end date, excludes future-only rows, and paginates by nearest expiry', () => {
  const snapshotAt = '2026-10-16T12:00:00.000Z';
  const usersById = makeUsersMap([
    { id: 1, name: 'An', email: 'an@test.vn', role: 'USER', is_active: true, created_at: '2026-10-01 00:00:00' },
    { id: 2, name: '', email: 'binh@test.vn', role: 'USER', is_active: false, created_at: '2026-10-01 00:00:00' },
    { id: 3, name: 'Future Only', email: 'future@test.vn', role: 'USER', is_active: true, created_at: '2026-10-01 00:00:00' }
  ]);
  const subscriptions = [
    { id: 1, user_id: 1, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-10-10T04:00:00Z', end_date: '2026-11-10T04:00:00Z', created_at: '2026-10-10T04:00:00Z' },
    { id: 2, user_id: 1, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-11-10T04:00:00Z', end_date: '2026-12-10T04:00:00Z', created_at: '2026-10-12T04:00:00Z' },
    { id: 3, user_id: 2, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'ADMIN', start_date: '2026-10-11T04:00:00Z', end_date: '2026-11-05T04:00:00Z', created_at: '2026-10-11T04:00:00Z' },
    // Future-only period has not started at snapshotAt
    { id: 4, user_id: 3, plan_code: 'USER_PLUS', status: 'ACTIVE', source: 'PAYOS', start_date: '2026-10-20T00:00:00Z', end_date: '2026-11-20T00:00:00Z', created_at: '2026-10-11T00:00:00Z' }
  ];

  const page1 = buildActivePlusUsersPage({ subscriptions, usersById, plans: [], snapshotAt, page: 1, limit: 1 });
  const page2 = buildActivePlusUsersPage({ subscriptions, usersById, plans: [], snapshotAt, page: 2, limit: 1 });

  assert.equal(page1.total, 2);
  assert.equal(page1.items.length, 1);
  assert.equal(page1.items[0].userId, 2); // expires Nov 5 before Dec 10
  assert.equal(page1.items[0].name, 'Khách hàng #2');
  assert.equal(page1.items[0].source, 'ADMIN');
  assert.equal(page1.items[0].accountActive, false);

  assert.equal(page2.items[0].userId, 1);
  assert.equal(page2.items[0].activePeriods, 2);
  assert.equal(page2.items[0].endDate, '2026-12-10T04:00:00.000Z');
  assert.equal(page2.items[0].planName, 'Swipe Nest Plus');
});
