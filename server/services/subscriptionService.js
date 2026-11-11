const { supabase } = require('../config/supabase');
const utc = (value) => value && !/(Z|[+-]\d\d:\d\d)$/.test(value) ? `${value}Z` : value;
const normalize = (data) => data ? { ...data, start_date: utc(data.start_date), end_date: utc(data.end_date),
  effective_status: data.status === 'ACTIVE' && data.start_date && new Date(utc(data.start_date)) <= new Date()
    && new Date(utc(data.end_date)) > new Date() ? 'ACTIVE' : 'EXPIRED' } : null;
async function getSubscription(userId) {
  const { data, error } = await supabase.rpc('agent_subscription_state', { p_user_id: userId });
  if (error) throw new Error('Subscription lookup failed');
  return data ? normalize({ ...data, upcoming: (data.upcoming || []).map(item => ({ ...item, start_date: utc(item.start_date), end_date: utc(item.end_date) })) }) : null;
}
// Dùng thử Lite 1 tháng miễn phí: mỗi tài khoản một lần, chỉ khi chưa từng có kỳ gói nào (migration 027).
async function getTrialStatus(userId) {
  const { data, error } = await supabase.rpc('agent_trial_available', { p_user_id: userId });
  if (error) throw new Error('Trial lookup failed');
  return { available: data === true, durationMonths: 1, planCode: 'LITE' };
}
async function startFreeTrial(userId) {
  const { error } = await supabase.rpc('start_agent_free_trial', { p_user_id: userId });
  if (error) {
    if (error.code === '23505') throw Object.assign(new Error('Tài khoản đã dùng thử hoặc đã từng có gói, không thể dùng thử thêm.'), { statusCode: 409 });
    if (error.code === '22023') throw Object.assign(new Error('Gói Lite đang tạm ngừng nên chưa thể dùng thử.'), { statusCode: 409 });
    if (error.code === '42501') throw Object.assign(new Error('Tài khoản môi giới không hoạt động.'), { statusCode: 403 });
    throw Object.assign(new Error('Không thể kích hoạt dùng thử lúc này. Vui lòng thử lại.'), { statusCode: 503 });
  }
  return getSubscription(userId);
}
// Hủy các kỳ đã mua nhưng chưa bắt đầu; kỳ đang chạy giữ nguyên đến hết hạn. Không hoàn tiền trong hệ thống.
async function cancelQueuedPeriods(userId, reason) {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 5 || text.length > 500) {
    throw Object.assign(new Error('Nhập lý do hủy từ 5 đến 500 ký tự.'), { statusCode: 400 });
  }
  const { data, error } = await supabase.rpc('agent_cancel_queued_periods', { p_user_id: userId, p_reason: text });
  if (error) {
    if (error.code === '42501') throw Object.assign(new Error('Tài khoản môi giới không hoạt động.'), { statusCode: 403 });
    throw Object.assign(new Error('Không thể hủy các kỳ đang chờ lúc này. Vui lòng thử lại.'), { statusCode: 503 });
  }
  return { cancelled: Number(data?.cancelled || 0), subscription: await getSubscription(userId) };
}
module.exports = { getSubscription, getTrialStatus, startFreeTrial, cancelQueuedPeriods };
