const trustScoreService = require('../services/trustScoreService');

const checkProfileCompleted = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const result = await trustScoreService.applyProfileCompletenessBonus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to check profile completeness' });
  }
};

const checkThirtyDaysClean = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    const result = await trustScoreService.applyThirtyDaysNoViolationBonus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to check account status' });
  }
};

module.exports = {
  checkProfileCompleted,
  checkThirtyDaysClean
};
