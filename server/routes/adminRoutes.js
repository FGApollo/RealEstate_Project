const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// 1. API xem danh sách KYC bị từ chối
// GET /api/admin/kyc/rejected?adminId=1
router.get('/kyc/rejected', adminController.getRejectedKyc);

// 2. API xem chi tiết một hồ sơ KYC
// GET /api/admin/kyc/:verificationId?adminId=1
router.get('/kyc/:verificationId', adminController.getKycDetail);

// 3. API admin duyệt KYC
// POST /api/admin/kyc/:verificationId/approve
router.post('/kyc/:verificationId/approve', adminController.approveKyc);

// 4. API admin từ chối KYC
// POST /api/admin/kyc/:verificationId/reject
router.post('/kyc/:verificationId/reject', adminController.rejectKyc);

// API Kiểm duyệt đánh giá (Review Moderation)
router.get('/reviews', adminController.getAllReviews);
router.post('/reviews/:reviewId/status', adminController.updateReviewStatus);

module.exports = router;
