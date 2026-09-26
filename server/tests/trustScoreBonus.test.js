const assert = require('node:assert/strict');
const test = require('node:test');
const router = require('../routes/trustScoreRoutes');
const adminRouter = require('../routes/adminRoutes');

test('trustScoreRoutes registers all expected bonus task and logs endpoints', () => {
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  const paths = routes.map((r) => r.path);
  assert.ok(paths.includes('/tasks'), 'Route /tasks should exist');
  assert.ok(paths.includes('/my-logs'), 'Route /my-logs should exist');
  assert.ok(paths.includes('/profile-completed/check'), 'Route /profile-completed/check should exist');
  assert.ok(paths.includes('/30-days-clean/check'), 'Route /30-days-clean/check should exist');
  assert.ok(paths.includes('/kyc-completed/check'), 'Route /kyc-completed/check should exist');

  const tasksRoute = routes.find((r) => r.path === '/tasks');
  assert.ok(tasksRoute.methods.includes('get'), 'GET /tasks should be allowed');

  const myLogsRoute = routes.find((r) => r.path === '/my-logs');
  assert.ok(myLogsRoute.methods.includes('get'), 'GET /my-logs should be allowed');

  const profileRoute = routes.find((r) => r.path === '/profile-completed/check');
  assert.ok(profileRoute.methods.includes('post'), 'POST /profile-completed/check should be allowed');

  const cleanRoute = routes.find((r) => r.path === '/30-days-clean/check');
  assert.ok(cleanRoute.methods.includes('post'), 'POST /30-days-clean/check should be allowed');

  const kycRoute = routes.find((r) => r.path === '/kyc-completed/check');
  assert.ok(kycRoute.methods.includes('post'), 'POST /kyc-completed/check should be allowed');
});

test('adminRoutes registers audit log endpoint /trust-score-logs and adjustment endpoint /trust-score/adjust', () => {
  const adminRoutes = adminRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  const paths = adminRoutes.map((r) => r.path);
  assert.ok(paths.includes('/trust-score-logs'), 'Route /trust-score-logs should exist in adminRoutes');
  const auditRoute = adminRoutes.find((r) => r.path === '/trust-score-logs');
  assert.ok(auditRoute.methods.includes('get'), 'GET /trust-score-logs should be allowed');

  assert.ok(paths.includes('/trust-score/adjust'), 'Route /trust-score/adjust should exist in adminRoutes');
  const adjustRoute = adminRoutes.find((r) => r.path === '/trust-score/adjust');
  assert.ok(adjustRoute.methods.includes('post'), 'POST /trust-score/adjust should be allowed');
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

test('Feature 53: Low Trust Score threshold enforcement (<= 30 blocks listings & hides properties)', () => {
  const { LOW_TRUST_SCORE_THRESHOLD } = require('../services/trustScoreService');
  assert.equal(LOW_TRUST_SCORE_THRESHOLD, 30, 'Threshold must be strictly 30 points');

  const checkCanCreateListing = (trustScore) => {
    const score = Number(trustScore ?? 50);
    return score > LOW_TRUST_SCORE_THRESHOLD;
  };

  // Test posting permissions: 30 and below are blocked
  assert.equal(checkCanCreateListing(0), false, 'Score 0 must be blocked from posting');
  assert.equal(checkCanCreateListing(10), false, 'Score 10 must be blocked from posting');
  assert.equal(checkCanCreateListing(29), false, 'Score 29 must be blocked from posting');
  assert.equal(checkCanCreateListing(30), false, 'Score 30 must also be blocked from posting');
  assert.equal(checkCanCreateListing(31), true, 'Score 31 must be allowed to post');
  assert.equal(checkCanCreateListing(50), true, 'Score 50 must be allowed to post');
  assert.equal(checkCanCreateListing(100), true, 'Score 100 must be allowed to post');

  // Test public marketplace filtering: owner score must be > 30
  const sampleProperties = [
    { id: 1, title: 'House A', is_hidden: false, owner: { trust_score: 80 } },
    { id: 2, title: 'House B', is_hidden: false, owner: { trust_score: 25 } },
    { id: 3, title: 'House C', is_hidden: false, owner: { trust_score: 0 } },
    { id: 4, title: 'House D', is_hidden: false, owner: { trust_score: 30 } },
    { id: 5, title: 'House E', is_hidden: false, owner: { trust_score: 31 } }
  ];

  const visiblePublicProperties = sampleProperties.filter((p) => {
    const score = Number(p.owner?.trust_score ?? 50);
    return !p.is_hidden && score > LOW_TRUST_SCORE_THRESHOLD;
  });

  assert.equal(visiblePublicProperties.length, 2, 'Only properties with owner trust score > 30 should be visible');
  assert.deepEqual(visiblePublicProperties.map((p) => p.id), [1, 5]);
});

test('KYC manual bonus logic: requires explicit claim when VERIFIED and bonus is not yet claimed', () => {
  const evaluateKycTask = (verificationStatus, approvedCount, revokedCount) => {
    const isKycVerified = verificationStatus === 'VERIFIED';
    const isKycPending = verificationStatus === 'PENDING';
    const hasKycBonus = approvedCount > revokedCount;

    return {
      claimed: hasKycBonus,
      eligible: isKycVerified && !hasKycBonus,
      isPending: isKycPending
    };
  };

  // Case 1: Brand new user with PENDING KYC
  const case1 = evaluateKycTask('PENDING', 0, 0);
  assert.equal(case1.claimed, false);
  assert.equal(case1.eligible, false);
  assert.equal(case1.isPending, true);

  // Case 2: User verified by admin, has NOT claimed bonus yet
  const case2 = evaluateKycTask('VERIFIED', 0, 0);
  assert.equal(case2.claimed, false);
  assert.equal(case2.eligible, true, 'Verified user who has not claimed should see claim button');
  assert.equal(case2.isPending, false);

  // Case 3: User already claimed +20 bonus
  const case3 = evaluateKycTask('VERIFIED', 1, 0);
  assert.equal(case3.claimed, true, 'User who claimed bonus should show claimed badge');
  assert.equal(case3.eligible, false);
  assert.equal(case3.isPending, false);

  // Case 4: User was verified, bonus was revoked, and later re-verified
  const case4 = evaluateKycTask('VERIFIED', 1, 1);
  assert.equal(case4.claimed, false);
  assert.equal(case4.eligible, true, 'Re-verified user with revoked bonus should be eligible to claim again');
});

