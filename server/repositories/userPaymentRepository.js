const { supabase } = require('../config/supabase');
const agentRepository = require('./paymentRepository');

const { result } = agentRepository;
const rpc = async (name, args) => result(await supabase.rpc(name, args));

const DEFAULT_PLANS = [
  { code: 'USER_PLUS', name: 'Swipe Nest Plus', amount_vnd: 20000, duration_months: 1, version: 1, active: true }
];

// Đơn mua gói Plus của người dùng: cùng bảng agent_payment_orders (audience = 'USER'), cùng hàm đồng bộ / xác nhận
// với payOS. Chỉ khác danh mục gói và hàm giữ chỗ đơn.
module.exports = {
  planCodes: ['USER_PLUS'],
  DEFAULT_PLANS,
  async plans() {
    try {
      const response = await supabase.from('user_billing_plans')
        .select('code, name, amount_vnd, duration_months, version').eq('active', true).order('amount_vnd');
      if (response.error) {
        return DEFAULT_PLANS;
      }
      return result(response);
    } catch {
      return DEFAULT_PLANS;
    }
  },
  async find(id, userId) {
    let query = supabase.from('agent_payment_orders').select('*').eq('id', id).eq('audience', 'USER');
    if (userId !== undefined) query = query.eq('user_id', userId);
    let resp = await query.maybeSingle();
    if (resp.error && (resp.error.code === '42703' || resp.error.message?.includes('audience'))) {
      let fallback = supabase.from('agent_payment_orders').select('*').eq('id', id).eq('plan_code', 'USER_PLUS');
      if (userId !== undefined) fallback = fallback.eq('user_id', userId);
      resp = await fallback.maybeSingle();
    }
    return result(resp);
  },
  findByCode: agentRepository.findByCode,
  async list(userId, page, limit) {
    let response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
      .eq('audience', 'USER').order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
    if (response.error && (response.error.code === '42703' || response.error.message?.includes('audience'))) {
      response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
        .eq('plan_code', 'USER_PLUS').order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
    }
    if (response.error) {
      return { items: [], total: 0, page, limit };
    }
    try {
      return { items: result(response), total: response.count, page, limit };
    } catch {
      return { items: [], total: 0, page, limit };
    }
  },
  reserve: (userId, planCode, requestId, version) => rpc('reserve_user_payment', {
    p_user_id: userId, p_plan_code: planCode, p_request_id: requestId, p_expected_version: version
  }),
  claimSync: agentRepository.claimSync,
  update: agentRepository.update,
  settle: agentRepository.settle
};
