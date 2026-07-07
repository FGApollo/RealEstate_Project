const reportService = require('../services/reportService');

const createReport = async (req, res) => {
  try {
    const { propertyId, reporterId, reason, description } = req.body;
    const result = await reportService.createReport({
      propertyId,
      reporterId,
      reason,
      description
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to create report' });
  }
};

const getAdminReports = async (req, res) => {
  try {
    const { status } = req.query;
    const result = await reportService.getAdminReports(status);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to fetch reports' });
  }
};

const resolveReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminId } = req.body;
    const result = await reportService.resolveReport(reportId, adminId);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to resolve report' });
  }
};

const rejectReport = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { adminId } = req.body;
    const result = await reportService.rejectReport(reportId, adminId);
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Failed to reject report' });
  }
};

module.exports = {
  createReport,
  getAdminReports,
  resolveReport,
  rejectReport,
  VALID_REASONS: reportService.VALID_REASONS,
  DEDUCTION_MAP: reportService.DEDUCTION_MAP
};
