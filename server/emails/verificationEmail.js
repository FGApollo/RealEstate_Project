const fs = require('node:fs');
const path = require('node:path');

const htmlTemplate = fs.readFileSync(path.join(__dirname, 'verification.html'), 'utf8');
const imageNames = [
  'brand-mark', 'verification-mascot', 'shield-white', 'mail-white', 'arrow-white',
  'clock', 'home', 'shield-blue', 'headset', 'footer-wave'
];
// Inline MIME images travel with the message; no image hosting or extra env is needed.
const inlineAttachments = imageNames.map((name) => ({
  filename: `${name}.png`,
  contentId: `${name}@swipenest`,
  contentType: 'image/png',
  content: fs.readFileSync(path.join(__dirname, 'assets', `${name}.png`))
}));

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const buildVerificationEmail = ({ link, year = new Date().getUTCFullYear() }) => ({
  html: htmlTemplate.replaceAll('{{VERIFICATION_URL}}', escapeHtml(link))
    .replaceAll('{{YEAR}}', escapeHtml(year)),
  text: `Xác thực email của bạn — SwipeNest\n\nCảm ơn bạn đã đăng ký tài khoản SwipeNest.\nVui lòng xác thực địa chỉ email để hoàn tất quá trình tạo tài khoản:\n\n${link}\n\nLiên kết hết hạn sau 24 giờ.\nKhông phải bạn đăng ký? Bạn có thể bỏ qua email này một cách an toàn.\n\nCần hỗ trợ? Liên hệ swipenestllc@gmail.com\n© ${year} SwipeNest. Tìm nhà dễ dàng. An tâm bắt đầu.`,
  inlineAttachments
});

module.exports = { buildVerificationEmail };
