const express = require('express');
const router = express.Router();
const trustScoreController = require('../controllers/trustScoreController');
const { authenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);

router.get('/tasks', rateLimiters.read, trustScoreController.getBonusTasksStatus);
router.get('/my-logs', rateLimiters.read, trustScoreController.getMyLogs);
router.post('/profile-completed/check', rateLimiters.write, trustScoreController.checkProfileCompleted);
router.post('/30-days-clean/check', rateLimiters.write, trustScoreController.checkThirtyDaysClean);
router.post('/kyc-completed/check', rateLimiters.write, trustScoreController.checkKycCompleted);

module.exports = router;
