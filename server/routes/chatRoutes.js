const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);

router.get('/messages', rateLimiters.read, chatController.getMessages);
router.post('/messages', rateLimiters.message, chatController.sendMessage);
router.get('/conversations', rateLimiters.read, chatController.getConversations);
router.post('/funnel', requireRole('AGENT'), rateLimiters.write, chatController.updateFunnelStage);
router.get('/funnel/stats', requireRole('AGENT'), rateLimiters.read, chatController.getFunnelStats);

module.exports = router;
