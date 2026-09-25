const express = require('express');
const router = express.Router();
const phoneOtpController = require('../controllers/phoneOtpController');
const { authenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);

router.post('/send-otp', rateLimiters.otpSendIp, rateLimiters.otpSendUser, phoneOtpController.sendOtp);
router.post('/verify-otp', rateLimiters.otpVerifyIp, rateLimiters.otpVerifyUserPhone,
  phoneOtpController.verifyOtp);

module.exports = router;
