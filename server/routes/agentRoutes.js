const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate, requireRole('AGENT'));

router.get('/overview', agentController.getOverview);
router.get('/reviews', agentController.getAgentReviews);

module.exports = router;
