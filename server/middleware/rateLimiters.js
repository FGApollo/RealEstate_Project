const crypto = require('crypto');
const { rateLimit, ipKeyGenerator, MINUTE, HOUR } = require('express-rate-limit');

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizePhone = (phone) => String(phone || '').trim();

const readPositiveInteger = (name, fallback) => {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const hashKey = (...parts) => crypto
  .createHash('sha256')
  .update(parts.map((part) => String(part ?? '')).join('\u001f'))
  .digest('hex');

const ipKey = (req) => ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');

const rateLimitHandler = (policy) => (req, res) => {
  const resetAt = req.rateLimit?.resetTime?.getTime?.();
  const retryAfterSeconds = Number.isFinite(resetAt)
    ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
    : undefined;

  console.warn(JSON.stringify({
    event: 'rate_limit_exceeded',
    policy,
    method: req.method,
    route: req.originalUrl?.split('?')[0],
    userId: req.user?.id ?? null,
    clientIp: req.ip || null,
    at: new Date().toISOString()
  }));

  return res.status(429).json({
    error: 'Too many requests. Please try again later.',
    code: 'RATE_LIMITED',
    policy,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {})
  });
};

const createRateLimit = ({ name, windowMs, limit, keyGenerator }) => rateLimit({
  windowMs,
  limit,
  keyGenerator,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  identifier: name,
  handler: rateLimitHandler(name)
});

const createRateLimiters = (overrides = {}) => {
  const config = {
    apiWindowMs: readPositiveInteger('API_RATE_LIMIT_WINDOW_MS', MINUTE),
    apiLimit: readPositiveInteger('API_RATE_LIMIT_MAX', 300),
    authWindowMs: readPositiveInteger('AUTH_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
    authIpLimit: readPositiveInteger('AUTH_IP_RATE_LIMIT_MAX', 60),
    loginLimit: readPositiveInteger('LOGIN_IP_EMAIL_RATE_LIMIT_MAX', 8),
    registerIpLimit: readPositiveInteger('REGISTER_IP_RATE_LIMIT_MAX', 10),
    registerEmailLimit: readPositiveInteger('REGISTER_IP_EMAIL_RATE_LIMIT_MAX', 3),
    verificationSendWindowMs: readPositiveInteger('EMAIL_VERIFICATION_SEND_WINDOW_MS', HOUR),
    verificationSendCooldownMs: readPositiveInteger('EMAIL_VERIFICATION_SEND_COOLDOWN_MS', MINUTE),
    verificationSendCooldownLimit: readPositiveInteger('EMAIL_VERIFICATION_SEND_COOLDOWN_MAX', 1),
    verificationSendIpLimit: readPositiveInteger('EMAIL_VERIFICATION_SEND_IP_MAX', 10),
    verificationSendEmailLimit: readPositiveInteger('EMAIL_VERIFICATION_SEND_IP_EMAIL_MAX', 5),
    verificationVerifyLimit: readPositiveInteger('EMAIL_VERIFICATION_VERIFY_IP_MAX', 30),
    googleLimit: readPositiveInteger('GOOGLE_LOGIN_IP_RATE_LIMIT_MAX', 20),
    sessionLimit: readPositiveInteger('AUTH_SESSION_IP_RATE_LIMIT_MAX', 40),
    writeWindowMs: readPositiveInteger('WRITE_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
    writeLimit: readPositiveInteger('WRITE_RATE_LIMIT_MAX', 60),
    readWindowMs: readPositiveInteger('AUTH_READ_RATE_LIMIT_WINDOW_MS', MINUTE),
    readLimit: readPositiveInteger('AUTH_READ_RATE_LIMIT_MAX', 120),
    messageWindowMs: readPositiveInteger('MESSAGE_RATE_LIMIT_WINDOW_MS', MINUTE),
    messageLimit: readPositiveInteger('MESSAGE_RATE_LIMIT_MAX', 30),
    otpSendWindowMs: readPositiveInteger('OTP_SEND_RATE_LIMIT_WINDOW_MS', HOUR),
    otpSendIpLimit: readPositiveInteger('OTP_SEND_IP_RATE_LIMIT_MAX', 8),
    otpSendUserLimit: readPositiveInteger('OTP_SEND_USER_RATE_LIMIT_MAX', 5),
    otpVerifyWindowMs: readPositiveInteger('OTP_VERIFY_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
    otpVerifyIpLimit: readPositiveInteger('OTP_VERIFY_IP_RATE_LIMIT_MAX', 30),
    otpVerifyUserLimit: readPositiveInteger('OTP_VERIFY_USER_RATE_LIMIT_MAX', 10),
    expensiveWindowMs: readPositiveInteger('EXPENSIVE_RATE_LIMIT_WINDOW_MS', 15 * MINUTE),
    expensiveLimit: readPositiveInteger('EXPENSIVE_RATE_LIMIT_MAX', 10),
    uploadWindowMs: readPositiveInteger('UPLOAD_RATE_LIMIT_WINDOW_MS', HOUR),
    uploadLimit: readPositiveInteger('UPLOAD_RATE_LIMIT_MAX', 10),
    ...overrides
  };

  const byIp = (name, windowMs, limit) => createRateLimit({
    name,
    windowMs,
    limit,
    keyGenerator: ipKey
  });

  const byUser = (name, windowMs, limit) => createRateLimit({
    name,
    windowMs,
    limit,
    keyGenerator: (req) => req.user?.id
      ? hashKey(name, 'user', req.user.id)
      : hashKey(name, 'ip', ipKey(req))
  });

  const byUserAndPhone = (name, windowMs, limit) => createRateLimit({
    name,
    windowMs,
    limit,
    keyGenerator: (req) => hashKey(
      name,
      'user',
      req.user?.id || 'unauthenticated',
      'phone',
      normalizePhone(req.body?.phone)
    )
  });

  const byIpAndEmail = (name, windowMs, limit) => createRateLimit({
    name,
    windowMs,
    limit,
    keyGenerator: (req) => hashKey(name, 'ip', ipKey(req), 'email', normalizeEmail(req.body?.email))
  });

  return {
    config,
    api: byIp('api-baseline', config.apiWindowMs, config.apiLimit),
    authIp: byIp('auth-ip', config.authWindowMs, config.authIpLimit),
    loginIpEmail: byIpAndEmail('login-ip-email', config.authWindowMs, config.loginLimit),
    registerIp: byIp('register-ip', HOUR, config.registerIpLimit),
    registerIpEmail: byIpAndEmail('register-ip-email', 24 * HOUR, config.registerEmailLimit),
    verificationSendIp: byIp(
      'email-verification-send-ip',
      config.verificationSendWindowMs,
      config.verificationSendIpLimit
    ),
    verificationSendCooldown: byIpAndEmail(
      'email-verification-send-cooldown',
      config.verificationSendCooldownMs,
      config.verificationSendCooldownLimit
    ),
    verificationSendIpEmail: byIpAndEmail(
      'email-verification-send-ip-email',
      config.verificationSendWindowMs,
      config.verificationSendEmailLimit
    ),
    verificationVerifyIp: byIp(
      'email-verification-verify-ip',
      config.authWindowMs,
      config.verificationVerifyLimit
    ),
    googleIp: byIp('google-login-ip', config.authWindowMs, config.googleLimit),
    sessionIp: byIp('auth-session-ip', config.authWindowMs, config.sessionLimit),
    write: byUser('authenticated-write', config.writeWindowMs, config.writeLimit),
    read: byUser('authenticated-read', config.readWindowMs, config.readLimit),
    message: byUser('message-send', config.messageWindowMs, config.messageLimit),
    otpSendIp: byIp('otp-send-ip', config.otpSendWindowMs, config.otpSendIpLimit),
    otpSendUser: byUser('otp-send-user', config.otpSendWindowMs, config.otpSendUserLimit),
    otpVerifyIp: byIp('otp-verify-ip', config.otpVerifyWindowMs, config.otpVerifyIpLimit),
    otpVerifyUserPhone: byUserAndPhone(
      'otp-verify-user-phone',
      config.otpVerifyWindowMs,
      config.otpVerifyUserLimit
    ),
    expensive: byUser('expensive-operation', config.expensiveWindowMs, config.expensiveLimit),
    upload: byUser('file-upload', config.uploadWindowMs, config.uploadLimit)
  };
};

const rateLimiters = createRateLimiters();

module.exports = {
  createRateLimiters,
  normalizeEmail,
  normalizePhone,
  rateLimiters
};
