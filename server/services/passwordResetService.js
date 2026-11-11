const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const emailService = require('./emailService');
const {
  createVerificationToken,
  hashVerificationToken,
  isVerificationTokenShapeValid
} = require('./emailVerificationPolicy');
const {
  createValidationError, normalizeEmail, validateEmail, validatePassword
} = require('./registrationValidation');

// Quên mật khẩu: token ngẫu nhiên 256 bit gửi qua email, DB chỉ giữ SHA-256 (migration 025).
const RESET_TTL_MINUTES = 30;
const GENERIC_MESSAGE = 'Nếu email này thuộc một tài khoản Swipe Nest, liên kết đặt lại mật khẩu sẽ được gửi đến hộp thư đó trong ít phút.';
const INVALID_LINK_MESSAGE = 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.';

const serviceError = (message, statusCode = 503, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

// Luôn trả cùng một thông báo, dù email có tồn tại hay không, để không lộ ai đã đăng ký.
const requestPasswordReset = async (email) => {
  if (!validateEmail(email)) throw createValidationError({ email: 'Email không hợp lệ' });
  emailService.assertConfigured();

  const { data: user, error } = await supabase.from('users')
    .select('id, email, is_active')
    .eq('email', normalizeEmail(email))
    .maybeSingle();
  if (error) throw serviceError('Chức năng đặt lại mật khẩu tạm thời không khả dụng');
  if (!user || user.is_active !== true) return { message: GENERIC_MESSAGE };

  const token = createVerificationToken();
  const { data, error: issueError } = await supabase.rpc('issue_password_reset_token', {
    p_user_id: user.id,
    p_token_hash: hashVerificationToken(token),
    p_expires_at: new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString()
  });
  if (issueError) {
    console.error('Password reset token issue failed:', issueError.code || issueError.name || 'database_error');
    throw serviceError('Chức năng đặt lại mật khẩu tạm thời không khả dụng');
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.issued) return { message: GENERIC_MESSAGE };

  // Không để thời gian phản hồi phụ thuộc vào việc gửi mail (tránh dò email qua độ trễ).
  void emailService.sendPasswordResetEmail({ email: user.email, token, ttlMinutes: RESET_TTL_MINUTES })
    .catch((sendError) => {
      console.error('Password reset delivery failed:', {
        code: sendError.code || sendError.name || 'mail_error',
        ...(sendError.providerCode && { providerCode: sendError.providerCode }),
        ...(sendError.providerStatus && { providerStatus: sendError.providerStatus })
      });
    });
  return { message: GENERIC_MESSAGE };
};

const resetPassword = async ({ token, password, confirmPassword }) => {
  if (!isVerificationTokenShapeValid(token)) {
    throw serviceError(INVALID_LINK_MESSAGE, 400, 'RESET_TOKEN_INVALID');
  }
  const passwordError = validatePassword(password);
  const errors = {};
  if (passwordError) errors.password = passwordError;
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) errors.confirmPassword = 'Passwords do not match';
  if (Object.keys(errors).length) throw createValidationError(errors);

  const passwordHash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase.rpc('consume_password_reset_token', {
    p_token_hash: hashVerificationToken(token),
    p_password_hash: passwordHash
  });
  if (error) {
    console.error('Password reset failed:', error.code || error.name || 'database_error');
    throw serviceError('Chức năng đặt lại mật khẩu tạm thời không khả dụng');
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.reset) throw serviceError(INVALID_LINK_MESSAGE, 400, 'RESET_TOKEN_INVALID');

  return { reset: true, message: 'Đã đặt mật khẩu mới. Mọi phiên đăng nhập cũ đã bị đăng xuất, hãy đăng nhập lại.' };
};

module.exports = { RESET_TTL_MINUTES, GENERIC_MESSAGE, requestPasswordReset, resetPassword };
