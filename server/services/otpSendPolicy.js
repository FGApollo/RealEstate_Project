const crypto = require('crypto');

const readPositiveInteger = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const getOtpSendLimits = (env = process.env) => {
  const maxPerHour = readPositiveInteger(env.OTP_SEND_MAX_PER_PHONE_PER_HOUR);
  const maxPerDay = readPositiveInteger(env.OTP_SEND_MAX_PER_PHONE_PER_DAY);
  const maxGlobalPerDay = readPositiveInteger(env.OTP_SEND_MAX_GLOBAL_PER_DAY);
  if (!maxPerHour || !maxPerDay || !maxGlobalPerDay) return null;
  return { maxPerHour, maxPerDay, maxGlobalPerDay };
};

const createOtpQuotaHash = (value, secret) => crypto
  .createHmac('sha256', secret)
  .update(String(value))
  .digest('hex');

module.exports = { getOtpSendLimits, createOtpQuotaHash };
