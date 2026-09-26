const assert = require('node:assert/strict');
const test = require('node:test');
const router = require('../routes/trustScoreRoutes');

test('trustScoreRoutes registers all expected bonus task endpoints', () => {
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes('/tasks'), 'Route /tasks should exist');
  assert.ok(paths.includes('/profile-completed/check'), 'Route /profile-completed/check should exist');
  assert.ok(paths.includes('/30-days-clean/check'), 'Route /30-days-clean/check should exist');

  const tasksRoute = routes.find((r) => r.path === '/tasks');
  assert.ok(tasksRoute.methods.includes('get'), 'GET /tasks should be allowed');

  const profileRoute = routes.find((r) => r.path === '/profile-completed/check');
  assert.ok(profileRoute.methods.includes('post'), 'POST /profile-completed/check should be allowed');

  const cleanRoute = routes.find((r) => r.path === '/30-days-clean/check');
  assert.ok(cleanRoute.methods.includes('post'), 'POST /30-days-clean/check should be allowed');
});

test('profile completeness validation requires non-empty avatar, name, and phone', () => {
  const checkCompleteness = (user) => {
    const hasAvatar = Boolean(user.avatar && String(user.avatar).trim());
    const hasName = Boolean(user.name && String(user.name).trim());
    const hasPhone = Boolean(user.phone && String(user.phone).trim());
    return hasAvatar && hasName && hasPhone;
  };

  assert.equal(checkCompleteness({ avatar: null, name: 'John', phone: '0901234567' }), false);
  assert.equal(checkCompleteness({ avatar: '   ', name: 'John', phone: '0901234567' }), false);
  assert.equal(checkCompleteness({ avatar: 'https://img.com/a.jpg', name: '   ', phone: '0901234567' }), false);
  assert.equal(checkCompleteness({ avatar: 'https://img.com/a.jpg', name: 'John', phone: '   ' }), false);
  assert.equal(checkCompleteness({ avatar: 'https://img.com/a.jpg', name: 'John', phone: '0901234567' }), true);
});

test('30-days clean logic: successfully appealed violations are refunded and excluded', () => {
  const resolvedReports = [
    { id: 101, status: 'RESOLVED', handled_at: '2026-09-01T00:00:00Z' },
    { id: 102, status: 'RESOLVED', handled_at: '2026-09-10T00:00:00Z' }
  ];

  // Case 1: Report 101 (string ID) and 102 (number ID) are both successfully appealed with refunds
  const refundedLogsCase1 = [
    { action: 'APPEAL_PENALTY_REFUND', related_report_id: '101' },
    { action: 'APPEAL_PENALTY_REFUND', related_report_id: 102 },
    { action: 'APPEAL_PENALTY_REFUND', related_report_id: null }
  ];
  const refundedReportIds1 = new Set(
    refundedLogsCase1
      .filter((l) => l.related_report_id != null)
      .map((l) => Number(l.related_report_id))
  );
  const activeViolations1 = resolvedReports.filter((r) => !refundedReportIds1.has(Number(r.id)));
  assert.equal(activeViolations1.length, 0, 'All successfully appealed violations should be excluded');

  // Case 2: Report 101 was refunded, but Report 102 was rejected (no refund)
  const refundedLogsCase2 = [
    { action: 'APPEAL_PENALTY_REFUND', related_report_id: 101 }
  ];
  const refundedReportIds2 = new Set(
    refundedLogsCase2
      .filter((l) => l.related_report_id != null)
      .map((l) => Number(l.related_report_id))
  );
  const activeViolations2 = resolvedReports.filter((r) => !refundedReportIds2.has(Number(r.id)));
  assert.equal(activeViolations2.length, 1, 'Rejected appeals must remain as active violations');
  assert.equal(activeViolations2[0].id, 102);

  // Case 3: No appeals refunded at all
  const refundedLogsCase3 = [];
  const refundedReportIds3 = new Set(
    refundedLogsCase3
      .filter((l) => l.related_report_id != null)
      .map((l) => Number(l.related_report_id))
  );
  const activeViolations3 = resolvedReports.filter((r) => !refundedReportIds3.has(Number(r.id)));
  assert.equal(activeViolations3.length, 2, 'Unappealed violations must remain active');
});
