const express = require('express');
const router = express.Router();
const trustScoreController = require('../controllers/trustScoreController');

router.post('/profile-completed/check', trustScoreController.checkProfileCompleted);
router.post('/30-days-clean/check', trustScoreController.checkThirtyDaysClean);

module.exports = router;
