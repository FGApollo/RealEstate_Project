const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const adminPlanController = require('../controllers/adminPlanController');
const trustScoreController = require('../controllers/trustScoreController');
const plusController = require('../controllers/plusController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

router.get('/service-plans', rateLimiters.read, adminPlanController.catalog);
router.get('/service-plans/history', rateLimiters.read, adminPlanController.history);
router.post('/service-plans/paid', rateLimiters.write, adminPlanController.change);
// Gói của một môi giới cụ thể: tra cứu (?id= hoặc ?email=), cấp, đổi hạng kỳ đang chạy, gỡ.
router.get('/agents/subscription', rateLimiters.read, adminPlanController.agentSubscription);
router.post('/agents/:agentId/subscription/grant', rateLimiters.write, adminPlanController.grantAgentPlan);
router.post('/agents/:agentId/subscription/change', rateLimiters.write, adminPlanController.changeAgentPeriod);
router.post('/agents/:agentId/subscription/remove', rateLimiters.write, adminPlanController.removeAgentPlan);
router.put('/agents/:agentId/official', rateLimiters.write, plusController.admin.setOfficial);

// Gói Swipe Nest Plus của người dùng: tra cứu (?id= hoặc ?email=), cấp thêm tháng, gỡ.
router.get('/users/plus', rateLimiters.read, plusController.admin.lookup);
router.post('/users/:userId/plus/grant', rateLimiters.write, plusController.admin.grant);
router.post('/users/:userId/plus/remove', rateLimiters.write, plusController.admin.remove);

// Nhãn "Swipe Nest đã kiểm tra" cho tin đăng.

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
