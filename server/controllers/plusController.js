const plusService = require('../services/plusService');
const plusAdminService = require('../services/plusAdminService');
const { createPaymentService } = require('../services/paymentService');
const userPaymentRepository = require('../repositories/userPaymentRepository');
const { createPayosService } = require('../services/payosService');
const propertyRepository = require('../repositories/propertyRepository');
const { toPublicProperty } = require('../services/publicPropertyDto');
const { safeErrorMessage } = require('../services/httpError');

// Đơn Plus dùng chung luồng payOS với môi giới, chỉ khác danh mục gói và hàm giữ chỗ đơn.
const provider = createPayosService();
const payments = createPaymentService(userPaymentRepository, provider);

const action = (fn, fallback) => async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { res.json(await fn(req)); }
  catch (error) {
    const status = error.statusCode || 503;
    res.status(status).json({ error: safeErrorMessage(error, fallback), code: error.code || 'PLUS_UNAVAILABLE' });
  }
};

module.exports = {
  status: action(async (req) => ({ plus: await plusService.getPlusState(req.user.id) }),
    'Chưa thể kiểm tra gói Plus. Vui lòng thử lại.'),
  catalog: action(async (req) => ({
    plans: await userPaymentRepository.plans(),
    plus: await plusService.getPlusState(req.user.id),
    checkout: provider.availability()
  }), 'Chưa thể tải thông tin gói Plus.'),
  listPayments: action((req) => payments.list(req.user.id, req.query), 'Chưa thể tải lịch sử thanh toán.'),
  createPayment: action((req) => payments.create(req.user.id, req.body), 'Thanh toán chưa sẵn sàng hoặc tạm thời gián đoạn. Vui lòng thử lại.'),
  getPayment: action((req) => payments.get(req.user.id, req.params.id), 'Chưa thể kiểm tra thanh toán.'),
  cancelPayment: action((req) => payments.cancel(req.user.id, req.params.id), 'Chưa thể hủy đơn.'),
  // Mục "Nguồn hàng Swipe Nest" ở trang chủ (tin của tài khoản chính thức): chỉ dành cho người có Plus.
  officialListings: action(async (req) => {
    if (!(await plusService.isPlusActive(req.user.id))) {
      throw Object.assign(new Error('Nguồn hàng Swipe Nest dành cho thành viên Swipe Nest Plus.'), { statusCode: 403, code: 'PLUS_REQUIRED' });
    }
    const properties = await propertyRepository.fetchPublicProperties({ filters: { official: true }, limit: 24 });
    return { properties: properties.map(toPublicProperty) };
  }, 'Chưa thể tải nguồn hàng Swipe Nest.'),

  admin: {
    lookup: action((req) => plusAdminService.lookupUser(req.user.id, req.query)),
    grant: action(async (req) => ({ plus: await plusAdminService.grant(req.user.id, req.params.userId, req.body) })),
    remove: action(async (req) => ({ plus: await plusAdminService.remove(req.user.id, req.params.userId, req.body) })),
    setOfficial: action(async (req) => ({ account: await plusAdminService.setOfficial(req.user.id, req.params.agentId, req.body) }))
  }
};
