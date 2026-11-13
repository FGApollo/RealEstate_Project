const { supabase } = require('../config/supabase');
const { paymentError } = require('../services/payosService');
const { assertTierCatalog } = require('../services/agentPlanCatalog');

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
  result,
  async plans() {
    const catalog = await rpc('agent_service_catalog', {});
    return assertTierCatalog(catalog.plans);
  },
  // Hạng của kỳ đang chạy (null nếu không có kỳ nào còn hiệu lực).
  async currentTier(userId) {
    const now = new Date().toISOString().replace('Z', '');
    try {
      const resp = await supabase.from('seller_subscriptions').select('support_tier, start_date')
        .eq('user_id', userId).eq('status', 'ACTIVE').lte('start_date', now).gt('end_date', now)
        .order('start_date', { ascending: false }).limit(1);
      if (resp.error && ['PGRST205', '42P01', '42703'].includes(resp.error.code)) return null;
      const rows = result(resp);
      return rows?.[0]?.support_tier || null;
    } catch (err) {
      if (['PAYMENT_MIGRATION_REQUIRED', 'PGRST205', '42P01'].includes(err.code)) return null;
      throw err;
    }
  },
  async find(id, userId) {
    let query = supabase.from('agent_payment_orders').select('*').eq('id', id).eq('audience', 'AGENT');
    if (userId !== undefined) query = query.eq('user_id', userId);
    let resp = await query.maybeSingle();
    if (resp.error && (resp.error.code === '42703' || resp.error.message?.includes('audience'))) {
      let fallback = supabase.from('agent_payment_orders').select('*').eq('id', id).neq('plan_code', 'USER_PLUS');
      if (userId !== undefined) fallback = fallback.eq('user_id', userId);
      resp = await fallback.maybeSingle();
      if (resp.error && (resp.error.code === '42703' || resp.error.message?.includes('plan_code'))) {
        let plain = supabase.from('agent_payment_orders').select('*').eq('id', id);
        if (userId !== undefined) plain = plain.eq('user_id', userId);
        resp = await plain.maybeSingle();
      }
    }
    return result(resp);
  },
  async findByCode(code) {
    return result(await supabase.from('agent_payment_orders').select('*').eq('order_code', code).maybeSingle());
  },
  async list(userId, page, limit) {
    let response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
      .eq('audience', 'AGENT').order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
    if (response.error && (response.error.code === '42703' || response.error.message?.includes('audience'))) {
      response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
        .neq('plan_code', 'USER_PLUS').order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
      if (response.error && (response.error.code === '42703' || response.error.message?.includes('plan_code'))) {
        response = await supabase.from('agent_payment_orders').select('*', { count: 'exact' }).eq('user_id', userId)
          .order('created_at', { ascending: false }).order('id').range((page - 1) * limit, page * limit - 1);
      }
    }
    if (response.error && ['PGRST205', '42P01'].includes(response.error.code)) {
      return { items: [], total: 0, page, limit };
    }
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
