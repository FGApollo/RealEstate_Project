const repository = require('../repositories/paymentRepository');
const { createPayosService, checkoutUrl, paymentError } = require('./payosService');
const { parsePagination } = require('./analyticsQuery');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN = new Set(['CREATING', 'PENDING']);

function dto(order) {
  return { id: order.id, orderCode: Number(order.order_code), planCode: order.plan_code, planName: order.plan_name,
    amount: order.amount_vnd, currency: order.currency, durationMonths: order.duration_months, status: order.status,
    checkoutUrl: order.checkout_url ? checkoutUrl(order.checkout_url) : null,
    createdAt: order.created_at, expiresAt: order.expires_at, paidAt: order.paid_at,
    subscriptionStart: order.grant_start, subscriptionEnd: order.grant_end,
    listingLimit: order.listing_limit, priorityPoints: order.priority_points, supportTier: order.support_tier };
}

// payOS bank timestamps without an offset are Vietnam local time.
function transactionTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value)) return null;
  const text = value.replace(' ', 'T');
  const date = new Date(/(Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text}+07:00`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function createPaymentService(repo = repository, provider = createPayosService()) {
  const owned = async (userId, id) => {
    if (!UUID.test(id)) throw paymentError(400, 'Mã đơn không hợp lệ.', 'INVALID_PAYMENT_ID');
    const order = await repo.find(id, userId);
    if (!order) throw paymentError(404, 'Không tìm thấy đơn thanh toán.', 'PAYMENT_NOT_FOUND');
    return order;
  };
  const applyProvider = async (order, remote, isCreate = false) => {
    const linkId = remote?.paymentLinkId || remote?.id;
    if (!remote || Number(remote.orderCode) !== Number(order.order_code) || remote.amount !== order.amount_vnd
      || typeof linkId !== 'string' || !/^[a-f0-9]{32}$/i.test(linkId)
      || (order.payment_link_id && order.payment_link_id !== linkId)
      || (remote.currency !== undefined && remote.currency !== 'VND')) {
      throw paymentError(502, 'Không thể xác minh thông tin thanh toán.', 'PAYMENT_PROVIDER_MISMATCH');
    }
    if (remote.status === 'PAID') {
      // A create/redirect response alone never activates a subscription.
      if (isCreate) return applyProvider(order, await provider.get(order.order_code));
      if (remote.amountPaid !== order.amount_vnd || remote.amountRemaining !== 0) {
        throw paymentError(409, 'Số tiền thanh toán cần được đối soát. Vui lòng liên hệ hỗ trợ.', 'PAYMENT_REVIEW_REQUIRED');
      }
      const transactions = (remote.transactions || []).map((item) => ({ ...item, time: transactionTime(item.transactionDateTime) }))
        .filter((item) => item.time).sort((a, b) => a.time.localeCompare(b.time));
      const last = transactions.at(-1);
      return repo.settle(order, { ...remote, id: linkId }, last?.time || new Date().toISOString(), last?.reference);
    }
    const status = ['CANCELLED', 'EXPIRED', 'FAILED'].includes(remote.status) ? remote.status
      : ['PENDING', 'PROCESSING', 'UNDERPAID'].includes(remote.status) ? 'PENDING' : null;
    if (!status) throw paymentError(502, 'Trạng thái thanh toán không hợp lệ.', 'PAYMENT_PROVIDER_INVALID');
    const url = checkoutUrl(remote.checkoutUrl || `https://pay.payos.vn/web/${linkId}`);
    return repo.update(order, { ...remote, id: linkId }, url, status);
  };
  const sync = async (order, force = false) => {
    if (order.status === 'PAID') return order;
    if (!force && !(await repo.claimSync(order.id))) return (await repo.find(order.id)) || order;
    return applyProvider(order, await provider.get(order.order_code));
  };
  return {
    async catalog() { return { plans: await repo.plans(), checkout: provider.availability() }; },
    async list(userId, query) {
      const { page, limit } = parsePagination(query);
      const data = await repo.list(userId, page, limit);
      return { ...data, items: data.items.map(dto) };
    },
    async create(userId, body) {
      if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['planCode', 'requestId', 'planVersion'].includes(key))
        || !['LITE','PLUS','PRO','PAID'].includes(body.planCode) || typeof body.requestId !== 'string' || !UUID.test(body.requestId)
        || !Number.isSafeInteger(body.planVersion) || body.planVersion < 1 || body.planVersion > 2147483647) {
        throw paymentError(400, 'Thông tin tạo đơn không hợp lệ.', 'INVALID_PAYMENT_REQUEST');
      }
      if (!provider.availability().available) throw paymentError(503, 'Thanh toán payOS chưa sẵn sàng.', 'PAYMENT_NOT_CONFIGURED');
      const order = await repo.reserve(userId, body.planCode, body.requestId, body.planVersion);
      if (!OPEN.has(order.status)) return dto(order);
      if (order.checkout_url) return dto(await sync(order));
      // Retry the same immutable order code after ambiguous failures; never issue
      // another bill merely because the first provider response was lost.
      let remote;
      try { remote = await provider.create(order); }
      catch {
        try { return dto(await sync(order, true)); }
        catch { throw paymentError(503, 'Chưa thể tạo liên kết. Hãy thử lại để tiếp tục cùng đơn thanh toán.', 'PAYMENT_CREATE_RETRY'); }
      }
      return dto(await applyProvider(order, remote, true));
    },
    async get(userId, id) { return dto(await sync(await owned(userId, id))); },
    async cancel(userId, id) {
      const order = await owned(userId, id);
      if (!OPEN.has(order.status)) return dto(order);
      return dto(await applyProvider(order, await provider.cancel(order.order_code)));
    },
    async webhook(body) {
      const data = await provider.verifyWebhook(body);
      if (!Number.isSafeInteger(data.orderCode) || data.orderCode < 1) throw paymentError(400, 'Mã đơn không hợp lệ.', 'INVALID_PAYMENT_REQUEST');
      const order = await repo.findByCode(data.orderCode);
      // payOS sends a signed sample while confirming the channel webhook.
      if (!order) return { received: true, ignored: true };
      if (data.code !== '00') return { received: true };
      if (data.paymentLinkId !== order.payment_link_id && order.payment_link_id) {
        throw paymentError(400, 'Đơn thanh toán không khớp.', 'PAYMENT_PROVIDER_MISMATCH');
      }
      if (order.status !== 'PAID') await sync(order, true);
      return { received: true };
    }
  };
}
module.exports = { ...createPaymentService(), createPaymentService, transactionTime, dto };
