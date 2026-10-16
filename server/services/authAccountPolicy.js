const ACCOUNT_ROLES = new Set(['USER', 'AGENT', 'ADMIN']);

const accountError = (message, code) => {
  const error = new Error(message);
  error.statusCode = 403;
  error.code = code;
  return error;
};

const normalizeAccountRole = (role) => (
  typeof role === 'string' && ACCOUNT_ROLES.has(role.toUpperCase()) ? role.toUpperCase() : null
);

const assertAccountCanAuthenticate = (user) => {
  // A missing/unknown status must not silently grant access to a privileged account.
  if (!user || user.is_active !== true) {
    throw accountError('Tài khoản đã bị vô hiệu hóa hoặc không còn khả dụng', 'ACCOUNT_DISABLED');
  }
  if (!normalizeAccountRole(user.role)) {
    throw accountError('Tài khoản không có quyền truy cập hợp lệ', 'ACCOUNT_ROLE_INVALID');
  }
};

module.exports = { normalizeAccountRole, assertAccountCanAuthenticate };
