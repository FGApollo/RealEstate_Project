const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');

router.get('/overview', agentController.getOverview);

module.exports = router;
