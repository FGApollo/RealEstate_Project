const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const { requireTrustedOrigin } = require('../middleware/trustedOrigin');
const { rateLimiters } = require('../middleware/rateLimiters');

router.post('/register', requireTrustedOrigin, rateLimiters.authIp, rateLimiters.registerIp,
  rateLimiters.registerIpEmail, authController.register);
router.post('/auth/resend-verification', requireTrustedOrigin, rateLimiters.authIp,
  rateLimiters.verificationSendIp, rateLimiters.verificationSendCooldown,
  rateLimiters.verificationSendIpEmail,
  authController.resendVerification);
router.post('/auth/verify-email', requireTrustedOrigin, rateLimiters.authIp,
  rateLimiters.verificationVerifyIp, authController.verifyEmail);
router.post('/login', requireTrustedOrigin, rateLimiters.authIp, rateLimiters.loginIpEmail,
  authController.login);
router.post('/google-login', requireTrustedOrigin, rateLimiters.authIp, rateLimiters.googleIp,
  authController.googleLogin);
router.post('/auth/refresh', requireTrustedOrigin, rateLimiters.authIp, rateLimiters.sessionIp,
  authController.refresh);
router.post('/auth/logout', requireTrustedOrigin, rateLimiters.authIp, rateLimiters.sessionIp,
  authController.logout);
router.get('/auth/me', authenticate, rateLimiters.read, authController.me);
router.get('/user/:id', authenticate, rateLimiters.read, authController.getUserById);

module.exports = router;
