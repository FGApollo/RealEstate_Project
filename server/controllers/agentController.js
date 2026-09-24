const agentService = require('../services/agentService');
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
    const reviews = await agentService.getAgentReviews(userId);
    res.status(200).json(reviews);
  } catch (error) {
    console.error('Error fetching agent reviews:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getOverview,
  getAgentReviews
};
