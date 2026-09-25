const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('AGENT'));

router.get('/', rateLimiters.read, subscriptionController.getSubscription);
router.post('/', rateLimiters.write, subscriptionController.createOrUpdateSubscription);

module.exports = router;
