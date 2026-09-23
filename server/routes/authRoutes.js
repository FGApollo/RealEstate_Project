const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');
const { requireTrustedOrigin } = require('../middleware/trustedOrigin');

router.post('/register', requireTrustedOrigin, authController.register);
router.post('/login', requireTrustedOrigin, authController.login);
router.post('/google-login', requireTrustedOrigin, authController.googleLogin);
router.post('/auth/refresh', requireTrustedOrigin, authController.refresh);
router.post('/auth/logout', requireTrustedOrigin, authController.logout);
router.get('/auth/me', authenticate, authController.me);
router.get('/user/:id', authenticate, authController.getUserById);

module.exports = router;
