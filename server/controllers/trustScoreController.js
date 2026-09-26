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

const checkKycCompleted = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await trustScoreService.applyKycCompletenessBonus(userId);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to claim KYC bonus' });
  }
};

const getMyLogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit, offset } = req.query;

    const result = await trustScoreService.getUserTrustScoreLogs(userId, { limit, offset });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to fetch trust score logs' });
  }
};

const getAdminLogs = async (req, res) => {
  try {
    const { page, limit, search, action, type } = req.query;

    const result = await trustScoreService.getAdminTrustScoreLogs({ page, limit, search, action, type });
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to fetch trust score audit logs' });
  }
};

const adjustTrustScoreManually = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { userId, email, pointChange, reason, relatedPropertyId, relatedReportId } = req.body;

    if ((!userId && !email) || pointChange === undefined || !reason) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Email (hoặc User ID), số điểm điều chỉnh và lý do.' });
    }

    const result = await trustScoreService.adjustTrustScoreManually({
      userId,
      email,
      adminId,
      pointChange: Number(pointChange),
      reason,
      relatedPropertyId,
      relatedReportId
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || 'Lỗi điều chỉnh điểm uy tín' });
  }
};

module.exports = {
  getBonusTasksStatus,
  checkProfileCompleted,
  checkThirtyDaysClean,
  checkKycCompleted,
  getMyLogs,
  getAdminLogs,
  adjustTrustScoreManually
};
