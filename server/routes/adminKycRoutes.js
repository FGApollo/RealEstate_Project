const express = require('express');
const router = express.Router();
const adminKycController = require('../controllers/adminKycController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

// GET /api/admin/kyc?status=PENDING|REJECTED&page=&limit=
router.get('/', rateLimiters.read, adminKycController.listVerifications);
router.get('/:verificationId', rateLimiters.read, adminKycController.getVerificationDetail);
router.post('/:verificationId/approve', rateLimiters.write, adminKycController.approveVerification);
router.post('/:verificationId/reject', rateLimiters.write, adminKycController.rejectVerification);

module.exports = router;
