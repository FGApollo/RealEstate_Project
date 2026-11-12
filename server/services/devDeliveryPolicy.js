// Chỉ dành cho máy dev không có Gmail / eSMS thật: in liên kết xác minh email và mã OTP ra terminal
// của server thay vì gửi đi, để chạy được luồng đăng ký và xác minh số điện thoại trên database cá nhân.
// Cần CẢ HAI điều kiện, giống chế độ demo KYC: NODE_ENV=development|test và DEV_CONSOLE_DELIVERY=true.
// Production không bao giờ bật được chế độ này.
const isDevConsoleDeliveryEnabled = (env = process.env) => ['development', 'test'].includes(env.NODE_ENV)
  && env.DEV_CONSOLE_DELIVERY === 'true';

const devFrontendOrigin = (env = process.env) => {
  try {
    return new URL(env.FRONTEND_URL || 'http://localhost:5173').origin;
  } catch {
    return 'http://localhost:5173';
  }
};

const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email || '').split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};

module.exports = { isDevConsoleDeliveryEnabled, devFrontendOrigin, maskEmail };
