const { supabase } = require('../config/supabase');

async function getDashboard(filters, now) {
  const { data, error } = await supabase.rpc('admin_analytics_dashboard', {
    p_start: filters.start,
    p_end: filters.end,
    p_bucket: filters.bucket,
    p_as_of: now.toISOString()
  });
  if (error) {
    const missing = ['PGRST202', '42883', '42P01', '42703'].includes(error.code);
    const failure = new Error(missing
      ? 'Thống kê chưa được cấu hình trong database. Cần áp dụng migration 010-admin-analytics.sql.'
      : 'Không thể tải dữ liệu thống kê. Vui lòng thử lại.');
    failure.statusCode = missing ? 503 : 500;
    failure.code = missing ? 'ANALYTICS_NOT_CONFIGURED' : 'ANALYTICS_QUERY_FAILED';
    throw failure;
  }
  if (!data || !data.users || !data.subscriptions) {
    throw Object.assign(new Error('Phản hồi thống kê không hợp lệ.'), { statusCode: 502 });
  }
  return data;
}

async function paymentRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error && ['PGRST202', '42883'].includes(error.code)) return null;
  if (error) throw Object.assign(new Error('Không thể tải thống kê thanh toán.'), { statusCode: 503 });
  return data;
}
const getRevenue = (filters, now) => paymentRpc('admin_payment_revenue', {
  p_start: filters.start, p_end: filters.end, p_bucket: filters.bucket, p_as_of: now.toISOString()
});
const getTransactions = (filters, pagination, now) => paymentRpc('admin_payment_transactions', {
  p_start: filters.start, p_end: filters.end, p_page: pagination.page, p_limit: pagination.limit, p_as_of: now.toISOString()
});
module.exports = { getDashboard, getRevenue, getTransactions };
