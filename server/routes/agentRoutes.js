const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('AGENT', 'ADMIN'));

router.get('/overview', rateLimiters.read, agentController.getOverview);
router.get('/reviews', rateLimiters.read, agentController.getAgentReviews);
router.post('/reviews/:reviewId/reply', rateLimiters.write, agentController.replyToReview);
router.post('/reviews/:reviewId/helpful', rateLimiters.write, agentController.toggleReviewHelpful);

module.exports = router;

