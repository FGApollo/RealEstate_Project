const multer = require('multer');

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Chỉ chấp nhận file hình ảnh định dạng JPG, JPEG, PNG hoặc WEBP'));
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  }
});

module.exports = {
  upload,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES
};
