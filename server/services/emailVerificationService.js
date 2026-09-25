const { supabase } = require('../config/supabase');
const emailService = require('./emailService');
const {
  TOKEN_TTL_MS,
  createVerificationToken,
  hashVerificationToken,
  isVerificationTokenShapeValid
} = require('./emailVerificationPolicy');
const { createValidationError, normalizeEmail, validateEmail } = require('./registrationValidation');

const GENERIC_MESSAGE = 'Nếu email này có thể đăng ký tài khoản, hướng dẫn xác minh sẽ được gửi đến địa chỉ đó.';

const serviceError = (message, statusCode = 503, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const issueAndSend = async (user) => {
  const token = createVerificationToken();
  const { data, error } = await supabase.rpc('issue_email_verification_token', {
    p_user_id: user.id,
    p_token_hash: hashVerificationToken(token),
    p_expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString()
  });

  if (error) {
    console.error('Email verification token issue failed:', error.code || error.name || 'database_error');
    throw serviceError('Email verification is temporarily unavailable', 503, 'EMAIL_VERIFICATION_UNAVAILABLE');
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.issued) return false;

  // Do not make the public response depend on SMTP latency or delivery outcome.
  // If delivery fails, the user can safely request a new link.
  void emailService.sendVerificationEmail({ email: user.email, token }).catch((sendError) => {
    // Keep the token usable for a resend, but never put the token or recipient in logs.
    console.error('Email verification delivery failed:', sendError.code || sendError.name || 'mail_error');
  });
  return true;
};

const prepareRegistrationDelivery = () => emailService.assertConfigured();

const resendVerification = async (email) => {
  if (!validateEmail(email)) {
    throw createValidationError({ email: 'Enter a valid email address' });
  }
  emailService.assertConfigured();

  const normalizedEmail = normalizeEmail(email);
  const { data: user, error } = await supabase.from('users')
    .select('id, email, email_verified_at')
    .eq('email', normalizedEmail)
    .maybeSingle();
  if (error) throw serviceError('Email verification is temporarily unavailable');

  if (user && !user.email_verified_at) {
    await issueAndSend(user);
  }

  return { message: GENERIC_MESSAGE };
};

const verifyEmail = async (token) => {
  if (!isVerificationTokenShapeValid(token)) {
    throw serviceError('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 400, 'VERIFICATION_TOKEN_INVALID');
  }

  const { data, error } = await supabase.rpc('consume_email_verification_token', {
    p_token_hash: hashVerificationToken(token)
  });
  if (error) {
    console.error('Email verification check failed:', error.code || error.name || 'database_error');
    throw serviceError('Email verification is temporarily unavailable');
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.verified) {
    throw serviceError('Liên kết xác minh không hợp lệ hoặc đã hết hạn', 400, 'VERIFICATION_TOKEN_INVALID');
  }

  return { verified: true, message: 'Email đã được xác minh. Bạn có thể đăng nhập.' };
};

module.exports = {
  GENERIC_MESSAGE,
  TOKEN_TTL_MS,
  issueAndSend,
  prepareRegistrationDelivery,
  resendVerification,
  verifyEmail
};
