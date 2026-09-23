const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate, requireRole('ADMIN'));

// KYC is handled by adminKycRoutes, mounted at /api/admin/kyc.

// API Kiểm duyệt đánh giá (Review Moderation)
router.get('/reviews', adminController.getAllReviews);
router.post('/reviews/:reviewId/status', adminController.updateReviewStatus);

module.exports = router;
