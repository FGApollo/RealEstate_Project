const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

router.get('/messages', chatController.getMessages);
router.post('/messages', chatController.sendMessage);
router.get('/conversations', chatController.getConversations);
router.post('/funnel', chatController.updateFunnelStage);
router.get('/funnel/stats', chatController.getFunnelStats);

module.exports = router;
