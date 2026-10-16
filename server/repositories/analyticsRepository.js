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

module.exports = { getDashboard };
