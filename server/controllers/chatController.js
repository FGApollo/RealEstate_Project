const chatService = require('../services/chatService');

const getMessages = async (req, res) => {
  try {
    const { otherId } = req.query;
    if (!otherId) {
      return res.status(400).json({ error: 'otherId is required' });
    }
    const messages = await chatService.getMessages(req.user.id, Number(otherId));
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error in getMessages:', error);
    res.status(500).json({ error: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, propertyId, message } = req.body;
    if (!receiverId || !message) {
      return res.status(400).json({ error: 'receiverId and message are required' });
    }
    const data = await chatService.sendMessage(req.user.id, Number(receiverId), propertyId ? Number(propertyId) : null, message);
    res.status(201).json({ success: true, message: data });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(500).json({ error: error.message });
  }
};

const getConversations = async (req, res) => {
  try {
    const conversations = await chatService.getConversations(req.user.id);
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({ error: error.message });
  }
};

const updateFunnelStage = async (req, res) => {
  try {
    const { userId, stage } = req.body;
    const targetUserId = Number(userId);
    if (!Number.isSafeInteger(targetUserId) || targetUserId <= 0 || !stage) {
      return res.status(400).json({ error: 'Valid userId and stage are required' });
    }
    const data = await chatService.updateFunnelStage(req.user.id, targetUserId, stage);
    res.status(200).json({ success: true, funnel: data });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('Error in updateFunnelStage:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

const getFunnelStats = async (req, res) => {
  try {
    const stats = await chatService.getFunnelStats(req.user.id);
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
