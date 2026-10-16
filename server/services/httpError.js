const safeErrorMessage = (error, fallback = 'Không thể xử lý yêu cầu lúc này. Vui lòng thử lại.') => {
  const status = error?.statusCode;
  return Number.isInteger(status) && status >= 400 && status < 500 && typeof error.message === 'string'
    ? error.message : fallback;
};
module.exports = { safeErrorMessage };
