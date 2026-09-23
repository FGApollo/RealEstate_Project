const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const { upload } = require('../middleware/uploadMiddleware');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate, requireRole('AGENT'));

router.get('/status', kycController.getKycStatus);
router.post(
  '/upload-card',
  upload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage', maxCount: 1 }
  ]),
  kycController.handleUploadError,
  kycController.uploadCard
);
router.post(
  '/upload-selfie',
  upload.single('selfieImage'),
  kycController.handleUploadError,
  kycController.uploadSelfie
);

module.exports = router;
