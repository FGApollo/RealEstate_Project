const trustScoreService = require('../services/trustScoreService');

const getBonusTasksStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await trustScoreService.getBonusTasksStatus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to get bonus tasks status' });
  }
};

const checkProfileCompleted = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await trustScoreService.applyProfileCompletenessBonus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to check profile completeness' });
  }
};

const checkThirtyDaysClean = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await trustScoreService.applyThirtyDaysNoViolationBonus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to check account status' });
  }
};

module.exports = {
  getBonusTasksStatus,
  checkProfileCompleted,
  checkThirtyDaysClean
};
