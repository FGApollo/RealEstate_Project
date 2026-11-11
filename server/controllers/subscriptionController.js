const { safeErrorMessage } = require('../services/httpError');
const subscriptionService = require('../services/subscriptionService');

const getSubscription = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const userId = req.user.id;

  try {
    const data = await subscriptionService.getSubscription(Number(userId));
    res.status(200).json(data || null);
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
  }
};

const getTrialStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.status(200).json(await subscriptionService.getTrialStatus(Number(req.user.id)));
  } catch (error) {
    console.error('Error fetching trial status:', error);
    res.status(500).json({ error: safeErrorMessage(error) });
  }
};

// Kích hoạt dùng thử Lite 1 tháng (gói trả phí đi qua /api/payments).
const createOrUpdateSubscription = async (req, res) => {
  const userId = Number(req.user.id);

  try {
    const data = await subscriptionService.startFreeTrial(userId);
    res.status(200).json(data);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(error.statusCode || 500).json({ error: safeErrorMessage(error) });
  }
};

const cancelQueuedPeriods = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    res.status(200).json(await subscriptionService.cancelQueuedPeriods(req.user.id, req.body?.reason));
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('Error cancelling queued periods:', error.message);
    res.status(error.statusCode || 500).json({ error: safeErrorMessage(error) });
  }
};

module.exports = {
  cancelQueuedPeriods,
  getSubscription,
  getTrialStatus,
  createOrUpdateSubscription
};
