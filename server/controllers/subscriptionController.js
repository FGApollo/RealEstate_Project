const subscriptionService = require('../services/subscriptionService');

const getSubscription = async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const data = await subscriptionService.getSubscription(Number(userId));
    res.status(200).json(data || null);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: error.message });
  }
};

const createOrUpdateSubscription = async (req, res) => {
  const { userId, planName, priceVnd, status, months } = req.body;
  if (!userId || !planName || !status) {
    return res.status(400).json({ error: 'Missing required body parameters' });
  }

  try {
    const data = await subscriptionService.createOrUpdateSubscription(
      Number(userId),
      planName,
      priceVnd || 0,
      status,
      months || 1
    );
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getSubscription,
  createOrUpdateSubscription
};
