const multer = require('multer');

const MAX_AVATAR_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Only JPG, JPEG, PNG and WEBP images are allowed'));
  }

  cb(null, true);
};

const avatarUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_AVATAR_FILE_SIZE_BYTES
  }
});

module.exports = {
  avatarUpload,
  MAX_AVATAR_FILE_SIZE_BYTES,
  ALLOWED_AVATAR_MIME_TYPES
};
