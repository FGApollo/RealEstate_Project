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
  change: action(req => service.change(req.user.id, req.body)),
  agentSubscription: action(req => service.agentSubscription(req.user.id, req.query)),
  grantAgentPlan: action(async req => ({ subscription: await service.grantAgentPlan(req.user.id, req.params.agentId, req.body) })),
  changeAgentPeriod: action(async req => ({ subscription: await service.changeAgentPeriod(req.user.id, req.params.agentId, req.body) })),
  removeAgentPlan: action(async req => ({ subscription: await service.removeAgentPlan(req.user.id, req.params.agentId, req.body) }))
};
