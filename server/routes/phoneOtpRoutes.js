const express = require('express');
const router = express.Router();
const phoneOtpController = require('../controllers/phoneOtpController');
const { authenticate } = require('../middleware/authenticate');

router.use(authenticate);

router.post('/send-otp', phoneOtpController.sendOtp);
router.post('/verify-otp', phoneOtpController.verifyOtp);

module.exports = router;
