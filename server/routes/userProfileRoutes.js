const express = require('express');
const router = express.Router();
const userProfileController = require('../controllers/userProfileController');
const { avatarUpload } = require('../middleware/avatarUploadMiddleware');
const { authenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);

router.post(
  '/avatar',
  rateLimiters.upload,
  avatarUpload.any(),
  userProfileController.handleAvatarUploadError,
  userProfileController.uploadAvatar
);

module.exports = router;
