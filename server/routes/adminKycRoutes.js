const express = require('express');
const router = express.Router();
const adminKycController = require('../controllers/adminKycController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('ADMIN'));

router.get('/rejected', rateLimiters.read, adminKycController.getRejectedVerifications);
router.get('/:verificationId', rateLimiters.read, adminKycController.getVerificationDetail);
router.post('/:verificationId/approve', rateLimiters.write, adminKycController.approveVerification);
router.post('/:verificationId/reject', rateLimiters.write, adminKycController.rejectVerification);

module.exports = router;
