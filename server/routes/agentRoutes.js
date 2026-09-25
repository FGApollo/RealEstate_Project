const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('AGENT'));

router.get('/overview', rateLimiters.read, agentController.getOverview);
router.get('/reviews', rateLimiters.read, agentController.getAgentReviews);

module.exports = router;
