const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.use(authenticate);

router.get('/messages', chatController.getMessages);
router.post('/messages', chatController.sendMessage);
router.get('/conversations', chatController.getConversations);
router.post('/funnel', requireRole('AGENT'), chatController.updateFunnelStage);
router.get('/funnel/stats', requireRole('AGENT'), chatController.getFunnelStats);

module.exports = router;
