const crypto = require('crypto');
const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');
const esmsService = require('./esmsService');
const { getOtpSendLimits, createOtpQuotaHash } = require('./otpSendPolicy');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const VIETNAM_PHONE_PATTERN = /^(03|05|07|08|09)\d{8}$/;

const createServiceError = (message, statusCode = 400, code, retryAfterSeconds) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  if (retryAfterSeconds) error.retryAfterSeconds = retryAfterSeconds;
  return error;
};

const normalizePhone = (phone) => String(phone || '').trim();

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

const getUserPhoneVerificationState = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, phone_verified')
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

const getLatestOtp = async (userId, phone, onlyUnused = false) => {
  let query = supabase
    .from('phone_otps')
    .select('id, otp_code, expires_at, is_used, attempt_count, created_at')
    .eq('user_id', userId)
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1);

  if (onlyUnused) {
    query = query.eq('is_used', false);
  }

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

const sendOtp = async ({ userId, phone }) => {
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
      otp_code: otpCode,
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

const incrementAttemptCount = async (otpRecord) => {
  const nextAttemptCount = (otpRecord.attempt_count || 0) + 1;
  const { error } = await supabase
    .from('phone_otps')
    .update({ attempt_count: nextAttemptCount })
    .eq('id', otpRecord.id);

  if (error) {
    throw new Error(error.message);
  }
};

const verifyOtp = async ({ userId, phone, otp }) => {
  const normalizedPhone = validatePhone(phone);
  const normalizedOtp = String(otp || '').trim();

  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw createServiceError('Invalid OTP');
  }

  await ensureUserExists(userId);

  const otpRecord = await getLatestOtp(userId, normalizedPhone, true);
  if (!otpRecord) {
    throw createServiceError('OTP not found');
  }

  if (parseDatabaseTimestamp(otpRecord.expires_at) <= Date.now()) {
    throw createServiceError('OTP has expired');
  }

  if ((otpRecord.attempt_count || 0) >= MAX_VERIFY_ATTEMPTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil(
      (parseDatabaseTimestamp(otpRecord.expires_at) - Date.now()) / 1000
    ));
    throw createServiceError('OTP attempt limit exceeded', 429, 'OTP_ATTEMPT_LIMIT', retryAfterSeconds);
  }

  if (otpRecord.otp_code !== normalizedOtp) {
    await incrementAttemptCount(otpRecord);
    throw createServiceError('Invalid OTP');
  }

  const currentUser = await getUserPhoneVerificationState(userId);
  if (currentUser.phone_verified !== true) {
    await trustScoreService.applyOneTimeBonus(
      userId,
      'PHONE_VERIFIED',
      10,
      'Phone number verified successfully'
    );
  }

  const verifiedAt = new Date().toISOString();
  const { error: otpError } = await supabase
    .from('phone_otps')
    .update({ is_used: true })
    .eq('id', otpRecord.id);

  if (otpError) {
    throw new Error(otpError.message);
  }

  const { error: userError } = await supabase
    .from('users')
    .update({
      phone: normalizedPhone,
      phone_verified: true,
      phone_verified_at: verifiedAt
    })
    .eq('id', userId);

  if (userError) {
    throw new Error(userError.message);
  }

  return {
    success: true,
    message: 'Phone verified successfully'
  };
};

module.exports = {
  sendOtp,
  verifyOtp,
  validatePhone,
  getLiveSmsQuota
};
