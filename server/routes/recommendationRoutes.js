const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.get('/', authenticate, requireRole('USER'), rateLimiters.read, recommendationController.getRecommendations);

module.exports = router;
