const service = require('../services/paymentService');
const { safeErrorMessage } = require('../services/httpError');

const action = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (error) {
    // Do not log SDK error objects, webhook payloads, bank information or keys.
    const status = error.statusCode || 503;
    res.status(status).json({ error: safeErrorMessage(error,
      status === 503 ? 'Thanh toán chưa sẵn sàng hoặc tạm thời gián đoạn. Vui lòng thử lại.' : undefined),
    code: error.code || 'PAYMENT_UNAVAILABLE' });
  }
};
module.exports = {
  catalog: action(() => service.catalog()),
  list: action((req) => service.list(req.user.id, req.query)),
  create: action((req) => service.create(req.user.id, req.body)),
  get: action((req) => service.get(req.user.id, req.params.id)),
  cancel: action((req) => service.cancel(req.user.id, req.params.id)),
  webhook: action((req) => service.webhook(req.body))
};
