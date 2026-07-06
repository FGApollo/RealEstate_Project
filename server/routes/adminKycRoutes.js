const express = require('express');
const router = express.Router();
const adminKycController = require('../controllers/adminKycController');

router.get('/rejected', adminKycController.getRejectedVerifications);
router.get('/:verificationId', adminKycController.getVerificationDetail);
router.post('/:verificationId/approve', adminKycController.approveVerification);
router.post('/:verificationId/reject', adminKycController.rejectVerification);

module.exports = router;
