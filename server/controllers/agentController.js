const agentService = require('../services/agentService');
const reviewService = require('../services/reviewService');
const { supabase } = require('../config/supabase');

const getOverview = async (req, res) => {
  const userId = req.user.id;

  try {
    const overview = await agentService.getOverview(userId);
    res.status(200).json(overview);
  } catch (error) {
    console.error('Error fetching agent overview:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
 };

const getAgentReviews = async (req, res) => {
  const userId = req.user.id;

  try {
    const reviews = await agentService.getAgentReviews(userId, userId);
    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching agent reviews:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

const replyToReview = async (req, res) => {
  const userId = req.user.id;
  const { reviewId } = req.params;
  const { reply_text } = req.body;

  if (!reply_text || !reply_text.trim()) {
    return res.status(400).json({ error: 'Nội dung phản hồi không được để trống' });
  }

  try {
    const reply = await reviewService.createReviewReply(reviewId, userId, reply_text);
    res.status(201).json(reply);
  } catch (error) {
    console.error('Error replying to review:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

const toggleReviewHelpful = async (req, res) => {
  const userId = req.user.id;
  const { reviewId } = req.params;

  try {
    const result = await reviewService.toggleReviewHelpful(reviewId, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error toggling review helpful in agentController:', error);
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getOverview,
  getAgentReviews,
  replyToReview,
  toggleReviewHelpful
};

