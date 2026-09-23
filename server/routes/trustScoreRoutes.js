const express = require('express');
const router = express.Router();
const trustScoreController = require('../controllers/trustScoreController');
const { authenticate } = require('../middleware/authenticate');

router.use(authenticate);

router.post('/profile-completed/check', trustScoreController.checkProfileCompleted);
router.post('/30-days-clean/check', trustScoreController.checkThirtyDaysClean);

module.exports = router;
