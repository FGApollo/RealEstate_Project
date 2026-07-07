const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

router.get('/overview', agentController.getOverview);
router.get('/reviews', agentController.getAgentReviews);

module.exports = router;
