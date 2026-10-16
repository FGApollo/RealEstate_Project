const service = require('../services/analyticsService');

const handle = (action) => async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    return res.json(await action(req.query));
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Không thể tải dữ liệu thống kê. Vui lòng thử lại.',
      code: error.code || 'ANALYTICS_ERROR'
    });
  }
};

module.exports = {
  getDashboard: handle(service.getDashboard),
  getTransactions: handle(service.getTransactions)
};
