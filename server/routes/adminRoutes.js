const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const trustScoreController = require('../controllers/trustScoreController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

// Authentication re-reads users from the DB. A disabled/unknown-status account
// cannot read business analytics even if its session still has time remaining.
router.use('/analytics', (req, res, next) => {
  if (req.user.is_active !== true) return res.status(403).json({ error: 'Tài khoản Admin không hoạt động.' });
  return next();
});

router.get('/analytics/overview', rateLimiters.read, analyticsController.getDashboard);
router.get('/analytics/transactions', rateLimiters.read, analyticsController.getTransactions);
router.get('/analytics/subscriptions/agents', rateLimiters.read, analyticsController.getActiveAgents);

// KYC is handled by adminKycRoutes, mounted at /api/admin/kyc.

// API Kiểm duyệt đánh giá (Review Moderation)
router.get('/reviews', rateLimiters.read, adminController.getAllReviews);
router.post('/reviews/:reviewId/status', rateLimiters.write, adminController.updateReviewStatus);

// API Ẩn / Mở khóa tin vi phạm (Listing Ban / Unban)
router.post('/properties/:propertyId/hide', rateLimiters.write, adminController.hideProperty);
router.post('/properties/:propertyId/unhide', rateLimiters.write, adminController.unhideProperty);

// API Tra cứu Audit Log Biến động điểm uy tín (Trust Score Audit Logs)
router.get('/trust-score-logs', rateLimiters.read, trustScoreController.getAdminLogs);

// API Can thiệp / Điều chỉnh điểm uy tín thủ công (Admin Manual Trust Score Adjustment)
router.post('/trust-score/adjust', rateLimiters.write, trustScoreController.adjustTrustScoreManually);

module.exports = router;
