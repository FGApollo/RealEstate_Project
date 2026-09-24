const express = require('express');
const router = express.Router();
const adminKycController = require('../controllers/adminKycController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate, requireRole('ADMIN'));

router.get('/rejected', adminKycController.getRejectedVerifications);
router.get('/:verificationId', adminKycController.getVerificationDetail);
router.post('/:verificationId/approve', adminKycController.approveVerification);
router.post('/:verificationId/reject', adminKycController.rejectVerification);

module.exports = router;
