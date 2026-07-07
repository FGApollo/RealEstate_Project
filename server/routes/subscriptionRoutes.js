const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');

router.get('/', subscriptionController.getSubscription);
router.post('/', subscriptionController.createOrUpdateSubscription);

module.exports = router;
