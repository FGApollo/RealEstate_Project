const { safeErrorMessage } = require('../services/httpError');
const userProfileService = require('../services/userProfileService');

const uploadAvatar = async (req, res) => {
  try {
    const userId = req.user.id;
    const avatar = req.file || req.files?.find((file) => file.fieldname.trim() === 'avatar');

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
    res.status(400).json({ error: safeErrorMessage(error, 'Failed to upload avatar') });
  }
};

const handleAvatarUploadError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Avatar image must be 5MB or smaller' });
  }

  return res.status(400).json({ error: safeErrorMessage(err, 'Invalid avatar upload request') });
};

const getProfile = async (req, res) => {
  try {
    const profile = await userProfileService.getUserProfile(req.user.id);
    res.status(200).json({
      success: true,
      user: profile
    });
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Không thể lấy thông tin người dùng') });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    const updated = await userProfileService.updateUserProfile(req.user.id, { name, phone });
    res.status(200).json({
      success: true,
      message: 'Cập nhật thông tin thành công',
      user: updated
    });
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Cập nhật thông tin thất bại') });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const result = await userProfileService.changeUserPassword(req.user.id, { currentPassword, newPassword });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Đổi mật khẩu thất bại') });
  }
};

module.exports = {
  uploadAvatar,
  handleAvatarUploadError,
  getProfile,
  updateProfile,
  changePassword
};
