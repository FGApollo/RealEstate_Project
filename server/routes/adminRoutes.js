const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const trustScoreController = require('../controllers/trustScoreController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

// KYC is handled by adminKycRoutes, mounted at /api/admin/kyc.

// API Kiểm duyệt đánh giá (Review Moderation)
router.get('/reviews', rateLimiters.read, adminController.getAllReviews);
router.post('/reviews/:reviewId/status', rateLimiters.write, adminController.updateReviewStatus);

// API Ẩn / Mở khóa tin vi phạm (Listing Ban / Unban)
router.post('/properties/:propertyId/hide', rateLimiters.write, adminController.hideProperty);
router.post('/properties/:propertyId/unhide', rateLimiters.write, adminController.unhideProperty);

// API Tra cứu Audit Log Biến động điểm uy tín (Trust Score Audit Logs)
router.get('/trust-score-logs', rateLimiters.read, trustScoreController.getAdminLogs);

module.exports = router;
