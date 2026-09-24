const subscriptionService = require('../services/subscriptionService');

const getSubscription = async (req, res) => {
  const userId = req.user.id;

  try {
    const data = await subscriptionService.getSubscription(Number(userId));
    res.status(200).json(data || null);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: error.message });
  }
};

const createOrUpdateSubscription = async (req, res) => {
  const { planName } = req.body;
  const userId = req.user.id;

  try {
    const data = await subscriptionService.startFreeTrial(userId, planName);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

module.exports = {
  getSubscription,
  createOrUpdateSubscription
};
