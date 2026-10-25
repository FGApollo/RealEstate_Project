const { safeErrorMessage } = require('../services/httpError');
const chatService = require('../services/chatService');
const MAX_MESSAGE_LENGTH = 2000;

const getMessages = async (req, res) => {
  try {
    const { otherId } = req.query;
    if (!otherId) {
      return res.status(400).json({ error: 'otherId is required' });
    }
    const messages = await chatService.getMessages(req.user.id, otherId, req.query);
    res.status(200).json({ messages });
  } catch (error) {
    console.error('Error in getMessages:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not load messages.' });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { receiverId, propertyId, message, attachments } = req.body;
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    const msgText = typeof message === 'string' ? message.trim() : '';

    if (!receiverId || (!msgText && !hasAttachments)) {
      return res.status(400).json({ error: 'receiverId and message or attachments are required' });
    }
    if (Number(receiverId) === Number(req.user.id)) {
      return res.status(400).json({ error: 'Bạn không thể tự gửi tin nhắn cho chính mình' });
    }
    if (msgText.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({ error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` });
    }
    const data = await chatService.sendMessage(
      req.user.id,
      receiverId,
      propertyId === undefined ? null : propertyId,
      msgText,
      attachments || []
    );
    res.status(201).json({ success: true, message: data });
  } catch (error) {
    console.error('Error in sendMessage:', error);
    res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Could not send message.' });
  }
};

const markMessagesAsRead = async (req, res) => {
  try {
    const { partnerId } = req.body;
    if (!partnerId) {
      return res.status(400).json({ error: 'partnerId is required' });
    }
    const result = await chatService.markMessagesAsRead(req.user.id, partnerId);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error('Error in markMessagesAsRead:', error);
    res.status(error.statusCode || 500).json({ error: safeErrorMessage(error) });
  }
};

const getConversations = async (req, res) => {
  try {
    const conversations = await chatService.getConversations(req.user.id);
    res.status(200).json({ conversations });
  } catch (error) {
    console.error('Error in getConversations:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
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
    res.status(error.statusCode || 500).json({ error: safeErrorMessage(error) });
  }
};

const getFunnelStats = async (req, res) => {
  try {
    const stats = await chatService.getFunnelStats(req.user.id);
    res.status(200).json({ stats });
  } catch (error) {
    console.error('Error in getFunnelStats:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
  }
};

module.exports = {
  MAX_MESSAGE_LENGTH,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  getConversations,
  updateFunnelStage,
  getFunnelStats
};
