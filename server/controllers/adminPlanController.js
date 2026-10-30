const service = require('../services/adminPlanService');
const { safeErrorMessage } = require('../services/httpError');
const action = fn => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await fn(req)); }
  catch (error) {
    res.status(error.statusCode || 503).json({ error: safeErrorMessage(error,
      'Không thể tải cấu hình gói dịch vụ. Vui lòng thử lại.'), code: error.code || 'PLAN_UNAVAILABLE' });
  }
};
module.exports = {
  catalog: action(req => service.catalog(req.user.id)),
  history: action(req => service.history(req.user.id, req.query)),
  change: action(req => service.change(req.user.id, req.body))
};
