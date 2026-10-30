const { supabase } = require('../config/supabase');
const utc = (value) => value && !/(Z|[+-]\d\d:\d\d)$/.test(value) ? `${value}Z` : value;
const normalize = (data) => data ? { ...data, start_date: utc(data.start_date), end_date: utc(data.end_date),
  effective_status: data.status === 'ACTIVE' && data.start_date && new Date(utc(data.start_date)) <= new Date()
    && new Date(utc(data.end_date)) > new Date() ? 'ACTIVE' : 'EXPIRED' } : null;
async function getSubscription(userId) {
  const { data, error } = await supabase.from('seller_subscriptions').select('*').eq('user_id', userId)
    .eq('status', 'ACTIVE').lte('start_date', new Date().toISOString()).gt('end_date', new Date().toISOString())
    .order('end_date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Subscription lookup failed');
  if (data) return normalize(data);
  const latest = await supabase.from('seller_subscriptions').select('*').eq('user_id', userId)
    .order('end_date', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(1).maybeSingle();
  if (latest.error) throw new Error('Subscription lookup failed');
  return normalize(latest.data);
}
async function startFreeTrial(userId, planName) {
  if (planName !== 'FREE_TRIAL') throw Object.assign(new Error('Gói trả phí cần được thanh toán qua payOS.'), { statusCode: 409 });
  const { data, error } = await supabase.rpc('start_agent_free_trial', { p_user_id: userId });
  if (error) {
    if (error.code === '23505') throw Object.assign(new Error('Tài khoản đã sử dụng hoặc đăng ký một gói dịch vụ.'), { statusCode: 409 });
    throw Object.assign(new Error('Không thể kích hoạt dùng thử lúc này.'), { statusCode: 503 });
  }
  return normalize(data);
}
module.exports = { getSubscription, startFreeTrial };
