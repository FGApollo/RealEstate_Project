const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');
const esmsService = require('./esmsService');
const { getOtpSendLimits, createOtpQuotaHash } = require('./otpSendPolicy');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const VIETNAM_PHONE_PATTERN = /^(03|05|07|08|09)\d{8}$/;

const createServiceError = (message, statusCode = 400, code, retryAfterSeconds) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (retryAfterSeconds) error.retryAfterSeconds = retryAfterSeconds;
  return error;
};

const normalizePhone = (phone) => typeof phone === 'string' ? phone.trim() : '';

const parseDatabaseTimestamp = (value) => {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();

  const timestamp = String(value).trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const normalizedTimestamp = timestamp.replace(' ', 'T');
  return new Date(hasTimezone ? normalizedTimestamp : `${normalizedTimestamp}Z`).getTime();
};

const validatePhone = (phone) => {
  const normalizedPhone = normalizePhone(phone);

  if (!VIETNAM_PHONE_PATTERN.test(normalizedPhone)) {
    throw createServiceError('Invalid Vietnamese phone number');
  }

  return normalizedPhone;
};

const getLiveSmsQuota = () => {
  const limits = getOtpSendLimits();
  if (!limits) {
    throw createServiceError(
      'Live OTP sending is not configured with per-phone and global daily limits',
      503
    );
  }
  return limits;
};

const reserveLiveSmsQuota = async (phone) => {
  if (!esmsService.isLiveSmsEnabled()) return;

  const { maxPerHour, maxPerDay, maxGlobalPerDay } = getLiveSmsQuota();
  const phoneHash = createOtpQuotaHash(phone, process.env.JWT_SECRET);
  const globalHash = createOtpQuotaHash('global-live-otp-sends', process.env.JWT_SECRET);
  const { data, error } = await supabase.rpc('reserve_phone_otp_send', {
    p_phone_hash: phoneHash,
    p_global_hash: globalHash,
    p_max_per_hour: maxPerHour,
    p_max_per_day: maxPerDay,
    p_max_global_per_day: maxGlobalPerDay,
    p_cooldown_seconds: Math.floor(OTP_COOLDOWN_MS / 1000)
  });

  if (error) {
    console.error('Live OTP quota reservation failed:', error.message);
    if (error.code === 'PGRST202' || error.message?.includes('reserve_phone_otp_send') || error.code === '42883') {
      console.warn('[reserveLiveSmsQuota] reserve_phone_otp_send RPC is not installed in database. Bypassing DB quota check.');
      return;
    }
    throw createServiceError('OTP sending is temporarily unavailable', 503);
  }

  const reservation = Array.isArray(data) ? data[0] : data;
  if (!reservation?.allowed) {
    const retryAfterSeconds = Math.max(1, Number(reservation?.retry_after_seconds) || 60);
    let message = 'Please wait before requesting another OTP.';
    if (reservation?.reason === 'HOURLY_LIMIT') {
      message = 'OTP send limit reached for this phone. Please try again later.';
    } else if (reservation?.reason === 'DAILY_LIMIT') {
      message = 'OTP daily send limit reached for this phone. Please try again tomorrow.';
    } else if (reservation?.reason === 'GLOBAL_DAILY_LIMIT') {
      message = 'OTP sending is temporarily limited. Please try again later.';
    }
    throw createServiceError(message, 429, undefined, retryAfterSeconds);
  }
};

const ensureUserExists = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('User not found', 404);
    }

    throw new Error(error.message);
  }

  if (!user) {
    throw createServiceError('User not found', 404);
  }

  return user;
};

const getLatestOtp = async (userId, phone) => {
  let query = supabase
    .from('phone_otps')
    .select('id, created_at')
    .eq('user_id', userId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const ensureOtpCooldownPassed = async (userId, phone) => {
  const latestOtp = await getLatestOtp(userId, phone);
  if (!latestOtp?.created_at) {
    return;
  }

  const createdAt = parseDatabaseTimestamp(latestOtp.created_at);
  if (Number.isFinite(createdAt) && Date.now() - createdAt < OTP_COOLDOWN_MS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((createdAt + OTP_COOLDOWN_MS - Date.now()) / 1000));
    throw createServiceError(
      'Please wait before requesting a new OTP',
      429,
      'OTP_COOLDOWN',
      retryAfterSeconds
    );
  }
};

const markOldOtpsUsed = async (userId, phone) => {
  const { error } = await supabase
    .from('phone_otps')
    .update({ is_used: true })
    .eq('user_id', userId)
    .eq('phone', phone)
    .eq('is_used', false);

  if (error) {
    throw new Error(error.message);
  }
};

const generateOtpCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const hashOtp = (userId, phone, otp) => crypto.createHmac('sha256', process.env.JWT_SECRET)
  .update(`${userId}:${phone}:${otp}`).digest('hex');

const sendOtp = async ({ userId, phone }) => {
  if (process.env.NODE_ENV === 'production' && !esmsService.isLiveSmsEnabled()) {
    throw createServiceError('Dịch vụ SMS xác thực chưa sẵn sàng.', 400);
  }
  const normalizedPhone = validatePhone(phone);

  await ensureUserExists(userId);
  await ensureOtpCooldownPassed(userId, normalizedPhone);
  // For billable SMS, reserve a shared, atomic per-phone quota before calling eSMS.
  // Failed provider requests still consume the reservation to avoid retry storms.
  await reserveLiveSmsQuota(normalizedPhone);
  await markOldOtpsUsed(userId, normalizedPhone);

  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();
  const otpCode = generateOtpCode();

  // Gửi tin nhắn SMS OTP qua eSMS Gateway
  const smsResult = await esmsService.sendOtpSms({
    phone: normalizedPhone,
    otp: otpCode
  });

  const { error } = await supabase
    .from('phone_otps')
    .insert({
      user_id: userId,
      phone: normalizedPhone,
      otp_code: 'REDACTED',
      otp_hash: hashOtp(userId, normalizedPhone, otpCode),
      delivered_live: !smsResult.isMock && !smsResult.sandbox,
      expires_at: expiresAt,
      is_used: false,
      attempt_count: 0
    });

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: smsResult.isMock
      ? 'Mã OTP đã được tạo (Chế độ giả lập eSMS)'
      : (smsResult.sandbox
          ? 'Mã OTP đã gửi qua Sandbox eSMS (Thử nghiệm kết nối thành công, không trừ tiền)'
          : 'Mã OTP đã được gửi đến số điện thoại của bạn qua SMS'),
    isMock: smsResult.isMock,
    sandbox: Boolean(smsResult.sandbox),
    smsId: smsResult.smsId
  };
};

const verifyOtp = async ({ userId, phone, otp }) => {
  const normalizedPhone = validatePhone(phone);
  const normalizedOtp = typeof otp === 'string' ? otp.trim() : '';

  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw createServiceError('Invalid OTP');
  }

  const { data: result, error } = await supabase.rpc('consume_phone_otp', {
    p_user_id: userId, p_phone: normalizedPhone,
    p_code_hash: hashOtp(userId, normalizedPhone, normalizedOtp),
    p_require_live: process.env.NODE_ENV === 'production'
  });
  if (error || !result) throw createServiceError('Không thể xác thực OTP lúc này. Vui lòng thử lại.', 503);
  if (!result.ok) {
    if (result.code === 'ATTEMPT_LIMIT') throw createServiceError('OTP attempt limit exceeded', 429, 'OTP_ATTEMPT_LIMIT', 300);
    throw createServiceError('Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu mã mới.');
  }
  // The phone is verified atomically already; a separate cosmetic bonus failure
  // must not make the verified OTP reusable or undo the verification result.
  try {
    await trustScoreService.applyOneTimeBonus(
      userId,
      'PHONE_VERIFIED',
      10,
      'Phone number verified successfully'
    );
  } catch { console.error('Could not apply phone verification bonus'); }

  return {
    success: true,
    message: 'Phone verified successfully',
    phone: normalizedPhone,
    phone_verified: true
  };
};

module.exports = {
  sendOtp,
  verifyOtp,
  validatePhone,
  getLiveSmsQuota
};
