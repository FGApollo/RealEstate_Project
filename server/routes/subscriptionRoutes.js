const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate, requireRole('AGENT'));

router.get('/', subscriptionController.getSubscription);
router.post('/', subscriptionController.createOrUpdateSubscription);

module.exports = router;
