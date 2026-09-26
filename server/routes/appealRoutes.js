const express = require('express');
const router = express.Router();
const appealController = require('../controllers/appealController');
const { upload } = require('../middleware/uploadMiddleware');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

// --- Agent Routes ---
router.get('/my-violations', authenticate, requireRole('AGENT'), rateLimiters.read, appealController.getAgentViolations);
router.post(
  '/upload-evidence',
  authenticate,
  requireRole('AGENT'),
  rateLimiters.upload,
  upload.fields([
    { name: 'evidenceImages', maxCount: 5 },
    { name: 'evidenceImage', maxCount: 1 }
  ]),
  appealController.handleUploadError,
  appealController.uploadEvidence
);
router.post('/', authenticate, requireRole('AGENT'), rateLimiters.write, appealController.submitAppeal);

// --- Admin Routes ---
router.get('/admin', authenticate, requireRole('ADMIN'), rateLimiters.read, appealController.getAdminAppeals);
router.post('/admin/:appealId/approve', authenticate, requireRole('ADMIN'), rateLimiters.write, appealController.approveAppeal);
router.post('/admin/:appealId/reject', authenticate, requireRole('ADMIN'), rateLimiters.write, appealController.rejectAppeal);

module.exports = router;
