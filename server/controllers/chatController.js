const chatService = require('../services/chatService');

const getMessages = async (req, res) => {
  try {
    const { userId, otherId } = req.query;
    if (!userId || !otherId) {
      return res.status(400).json({ error: 'userId and otherId are required' });
    }
    const messages = await chatService.getMessages(Number(userId), Number(otherId));
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error in getMessages:', error);
    res.status(500).json({ error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { senderId, receiverId, propertyId, message } = req.body;
    if (!senderId || !receiverId || !message) {
      return res.status(400).json({ error: 'senderId, receiverId, and message are required' });
    }
    const data = await chatService.sendMessage(Number(senderId), Number(receiverId), propertyId ? Number(propertyId) : null, message);
    res.status(201).json({ success: true, message: data });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({ error: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const conversations = await chatService.getConversations(Number(userId));
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateFunnelStage = async (req, res) => {
  try {
    const { agentId, userId, stage } = req.body;
    if (!agentId || !userId || !stage) {
      return res.status(400).json({ error: 'agentId, userId, and stage are required' });
    }
    const data = await chatService.updateFunnelStage(Number(agentId), Number(userId), stage);
    res.status(200).json({ success: true, funnel: data });
  } catch (error) {
    console.error('Error in updateFunnelStage:', error);
    res.status(500).json({ error: error.message });
  }
};

const getFunnelStats = async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }
    const stats = await chatService.getFunnelStats(Number(agentId));
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Error in getFunnelStats:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getMessages,
  sendMessage,
  getConversations,
  updateFunnelStage,
  getFunnelStats
};
