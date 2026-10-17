const { PayOS } = require('@payos/node');

const paymentError = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

function frontendOrigin(env = process.env) {
  try {
    const url = new URL(env.FRONTEND_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    if (url.protocol !== 'https:' && !(env.NODE_ENV !== 'production' && url.protocol === 'http:'
      && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    return url.origin;
  } catch {
    throw paymentError(503, 'Thanh toán chưa được cấu hình.', 'PAYMENT_NOT_CONFIGURED');
  }
}

function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://pay.payos.vn' || url.username || url.password
      || !/^\/web\/[a-fA-F0-9]{32}$/.test(url.pathname) || url.search || url.hash) throw new Error();
    return url.href;
  } catch {
    throw paymentError(502, 'Đường dẫn thanh toán không hợp lệ.', 'PAYMENT_PROVIDER_INVALID');
  }
}

function createPayosService(env = process.env, options = {}) {
  let client;
  const hasKeys = () => ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']
    .every((key) => typeof env[key] === 'string' && env[key].trim().length > 0);
  const getClient = () => {
    if (!hasKeys()) throw paymentError(503, 'Thanh toán chưa được cấu hình.', 'PAYMENT_NOT_CONFIGURED');
    client ||= new PayOS({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY,
      checksumKey: env.PAYOS_CHECKSUM_KEY, baseURL: 'https://api-merchant.payos.vn',
      timeout: 12000, maxRetries: 0, logLevel: 'off', ...options });
    return client;
  };
  return {
    availability() {
      try {
        frontendOrigin(env);
        const available = env.PAYOS_ENABLED === 'true' && hasKeys();
        return { available, reason: available ? null : 'Thanh toán payOS chưa sẵn sàng. Vui lòng quay lại sau.' };
      } catch { return { available: false, reason: 'Thanh toán payOS chưa sẵn sàng. Vui lòng quay lại sau.' }; }
    },
    async create(order) {
      if (!this.availability().available) throw paymentError(503, 'Thanh toán payOS chưa sẵn sàng.', 'PAYMENT_NOT_CONFIGURED');
      const resultUrl = `${frontendOrigin(env)}/sale/payment/${order.id}`;
      return getClient().paymentRequests.create({
        orderCode: Number(order.order_code), amount: order.amount_vnd,
        description: `SN${String(order.order_code).slice(-7)}`,
        items: [{ name: `${order.plan_name} - ${order.duration_months} thang`, quantity: 1, price: order.amount_vnd }],
        returnUrl: resultUrl, cancelUrl: resultUrl,
        expiredAt: Math.floor(new Date(order.expires_at).getTime() / 1000)
      });
    },
    get: (code) => getClient().paymentRequests.get(Number(code)),
    cancel: (code) => getClient().paymentRequests.cancel(Number(code), 'Agent requested cancellation'),
    async verifyWebhook(body) {
      const sdk = getClient(); // Missing keys must return 503 so payOS retries later.
      try { return await sdk.webhooks.verify(body || {}); }
      catch { throw paymentError(400, 'Chữ ký thanh toán không hợp lệ.', 'INVALID_PAYMENT_SIGNATURE'); }
    }
  };
}

module.exports = { createPayosService, frontendOrigin, checkoutUrl, paymentError };
