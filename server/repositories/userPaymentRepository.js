const { supabase } = require('../config/supabase');
const agentRepository = require('./paymentRepository');

const { result } = agentRepository;
const rpc = async (name, args) => result(await supabase.rpc(name, args));

// Đơn mua gói Plus của người dùng: cùng bảng agent_payment_orders (audience = 'USER'), cùng hàm đồng bộ / xác nhận
// với payOS. Chỉ khác danh mục gói và hàm giữ chỗ đơn.
module.exports = {
  planCodes: ['USER_PLUS'],
  async plans() {
    return result(await supabase.from('user_billing_plans')
      .select('code, name, amount_vnd, duration_months, version').eq('active', true).order('amount_vnd'));
  },
  async find(id, userId) {
    let query = supabase.from('agent_payment_orders').select('*').eq('id', id).eq('audience', 'USER');
    if (userId !== undefined) query = query.eq('user_id', userId);
    return result(await query.maybeSingle());
  },
  findByCode: agentRepository.findByCode,
  async list(userId, page, limit) {
    const response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
      .eq('audience', 'USER').order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
    return { items: result(response), total: response.count, page, limit };
  },
  reserve: (userId, planCode, requestId, version) => rpc('reserve_user_payment', {
    p_user_id: userId, p_plan_code: planCode, p_request_id: requestId, p_expected_version: version
  }),
  claimSync: agentRepository.claimSync,
  update: agentRepository.update,
  settle: agentRepository.settle
};
