const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

// KYC is handled by adminKycRoutes, mounted at /api/admin/kyc.

// API Kiểm duyệt đánh giá (Review Moderation)
router.get('/reviews', rateLimiters.read, adminController.getAllReviews);
router.post('/reviews/:reviewId/status', rateLimiters.write, adminController.updateReviewStatus);

module.exports = router;
