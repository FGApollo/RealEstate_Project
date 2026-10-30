const { supabase } = require('../config/supabase');
const { paymentError } = require('../services/payosService');

function result({ data, error }) {
  if (error) {
    if (error.code === '40001') throw paymentError(409,
      'Gói dịch vụ vừa thay đổi. Hãy làm mới bảng giá và xác nhận lại trước khi thanh toán.', 'PLAN_PRICE_CHANGED');
    if (error.code === '22023') throw paymentError(409,
      'Gói dịch vụ hiện không thể đăng ký. Hãy làm mới bảng giá.', 'PLAN_UNAVAILABLE');
    if (['PGRST202', '42P01', '42883'].includes(error.code)) {
      throw paymentError(503, 'Thanh toán chưa được cấu hình trong database.', 'PAYMENT_MIGRATION_REQUIRED');
    }
    throw paymentError(503, 'Không thể cập nhật thanh toán. Vui lòng thử lại.', 'PAYMENT_DATABASE_FAILED');
  }
  return data;
}
const rpc = async (name, args) => result(await supabase.rpc(name, args));
module.exports = {
  async plans() {
    const catalog = await rpc('agent_service_catalog', {});
    return catalog.plans;
  },
  async find(id, userId) {
    let query = supabase.from('agent_payment_orders').select('*').eq('id', id);
    if (userId !== undefined) query = query.eq('user_id', userId);
    return result(await query.maybeSingle());
  },
  async findByCode(code) {
    return result(await supabase.from('agent_payment_orders').select('*').eq('order_code', code).maybeSingle());
  },
  async list(userId, page, limit) {
    const response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
      .order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
    return { items: result(response), total: response.count, page, limit };
  },
  reserve: (userId, planCode, requestId, version) => rpc('reserve_agent_payment', {
    p_user_id: userId, p_plan_code: planCode, p_request_id: requestId, p_expected_version: version
  }),
  claimSync: (id) => rpc('claim_agent_payment_sync', { p_id: id }),
  update: (order, provider, url, status) => rpc('update_agent_payment', {
    p_id: order.id, p_link_id: provider.paymentLinkId || provider.id, p_checkout_url: url, p_status: status
  }),
  settle: (order, provider, paidAt, reference) => rpc('settle_agent_payment', {
    p_order_code: order.order_code, p_link_id: provider.id, p_amount: provider.amountPaid,
    p_paid_at: paidAt, p_reference: reference || null
  })
};
