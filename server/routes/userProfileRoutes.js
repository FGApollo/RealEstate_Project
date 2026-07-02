const express = require('express');
const router = express.Router();
const userProfileController = require('../controllers/userProfileController');
const { avatarUpload } = require('../middleware/avatarUploadMiddleware');

router.post(
  '/avatar',
  avatarUpload.any(),
  userProfileController.handleAvatarUploadError,
  userProfileController.uploadAvatar
);

module.exports = router;
