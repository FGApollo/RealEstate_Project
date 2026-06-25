const agentService = require('../services/agentService');
const { supabase } = require('../config/supabase');

const getOverview = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const overview = await agentService.getOverview(userId);
    res.status(200).json(overview);
  } catch (error) {
    console.error('Error fetching agent overview:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getOverview
};
