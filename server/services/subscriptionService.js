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
async function startFreeTrial() {
  throw Object.assign(new Error('Hệ thống hiện cung cấp Lite, Plus và Pro. Vui lòng chọn gói và thanh toán qua payOS.'), { statusCode: 409 });
}
module.exports = { getSubscription, startFreeTrial };
