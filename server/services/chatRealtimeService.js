// Báo "có tin mới" cho trình duyệt qua Supabase Realtime Broadcast.
// Sự kiện không chứa nội dung tin nhắn: client nhận tín hiệu rồi tự gọi lại API chat (có xác thực) để lấy dữ liệu.
const crypto = require('crypto');
const { resolveSupabaseServerKey } = require('../config/supabaseKey');
const { getJwtConfig } = require('./authSessionService');

const BROADCAST_TIMEOUT_MS = 3000;

// Tên kênh riêng của từng tài khoản, không đoán được nếu không có JWT_SECRET của server.
const topicForUser = (userId) => {
  const digest = crypto.createHmac('sha256', getJwtConfig().secret).update(`user:${Number(userId)}`).digest('hex');
  return `chat:${digest.slice(0, 32)}`;
};

// Gửi một sự kiện tới kênh của từng người dùng. Lỗi chỉ được ghi log: chat vẫn hoạt động nhờ polling dự phòng.
const notifyUsers = async (userIds, event, payload, { fetchImpl = fetch } = {}) => {
  const baseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const recipients = [...new Set((userIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
  if (!baseUrl || recipients.length === 0) return false;
  try {
    const response = await fetchImpl(`${baseUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { apikey: resolveSupabaseServerKey(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: recipients.map((id) => ({ topic: topicForUser(id), event, payload })) }),
      signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.warn(`Chat realtime broadcast failed with HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('Chat realtime broadcast failed:', error.name || 'error');
    return false;
  }
};

module.exports = { topicForUser, notifyUsers };
