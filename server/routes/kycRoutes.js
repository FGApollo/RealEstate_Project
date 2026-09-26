const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { upload } = require('../middleware/uploadMiddleware');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('AGENT'));

router.get('/status', rateLimiters.read, kycController.getKycStatus);
router.post(
  '/upload-card',
  rateLimiters.upload,
  upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 }
  ]),
  kycController.handleUploadError,
  kycController.uploadCard
);
router.post(
  '/upload-selfie',
  rateLimiters.upload,
  upload.single('selfieImage'),
  kycController.handleUploadError,
  kycController.uploadSelfie
);

module.exports = router;
