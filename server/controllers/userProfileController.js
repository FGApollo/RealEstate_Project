const userProfileService = require('../services/userProfileService');

const uploadAvatar = async (req, res) => {
  try {
    const { userId } = req.body;
    const avatar = req.file || req.files?.find((file) => file.fieldname.trim() === 'avatar');

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    if (!avatar) {
      return res.status(400).json({ error: 'Missing avatar file. Use form-data file field named avatar' });
    }

    const result = await userProfileService.uploadAvatar(userId, avatar);
    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatar: result.avatar,
      profileBonus: result.profileBonus
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to upload avatar' });
  }
};

const handleAvatarUploadError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Avatar image must be 5MB or smaller' });
  }

  return res.status(400).json({ error: err.message || 'Invalid avatar upload request' });
};

module.exports = {
  uploadAvatar,
  handleAvatarUploadError
};
