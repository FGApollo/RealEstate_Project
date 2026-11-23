const { supabase } = require('../config/supabase');

const MISSING_SCHEMA_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01', '42703']);
const PAGE_SIZE = 1000;
const MAX_PLUS_ROWS = 50000;
const USER_BATCH_SIZE = 500;

async function getDashboard(filters, now) {
  const { data, error } = await supabase.rpc('admin_analytics_dashboard', {
    p_start: filters.start,
    p_end: filters.end,
    p_bucket: filters.bucket,
    p_as_of: now.toISOString()
  });
  if (error) {
    const missing = MISSING_SCHEMA_CODES.has(error.code);
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

async function getActiveAgents({ snapshotAt, page, limit }) {
  const { data, error } = await supabase.rpc('admin_analytics_active_agents', {
    p_snapshot_at: snapshotAt, p_page: page, p_limit: limit
  });
  if (error) {
    const missing = ['PGRST202', '42883'].includes(error.code);
    throw Object.assign(new Error(missing
      ? 'Danh sách Agent chưa được cấu hình. Vui lòng thử lại sau.'
      : 'Không thể tải danh sách Agent. Vui lòng thử lại.'), {
      statusCode: 503, code: missing ? 'ACTIVE_AGENTS_NOT_CONFIGURED' : 'ACTIVE_AGENTS_QUERY_FAILED'
    });
  }
  if (!data || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw Object.assign(new Error('Không thể tải danh sách Agent. Vui lòng thử lại.'), { statusCode: 502 });
  }
  return data;
}

async function fetchAllPlusSubscriptions() {
  const rows = [];
  for (let offset = 0; offset < MAX_PLUS_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('id, user_id, plan_code, price_vnd, start_date, end_date, status, source, created_at')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      if (MISSING_SCHEMA_CODES.has(error.code)) return null;
      throw Object.assign(new Error('Không thể tải dữ liệu gói Plus. Vui lòng thử lại.'), {
        statusCode: 503, code: 'PLUS_ANALYTICS_QUERY_FAILED'
      });
    }
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchUsersByIds(userIds) {
  const usersById = new Map();
  for (let i = 0; i < userIds.length; i += USER_BATCH_SIZE) {
    const slice = userIds.slice(i, i + USER_BATCH_SIZE);
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, role, is_active, created_at')
      .in('id', slice);
    if (error) {
      throw Object.assign(new Error('Không thể tải thông tin khách hàng Plus. Vui lòng thử lại.'), {
        statusCode: 503, code: 'PLUS_ANALYTICS_QUERY_FAILED'
      });
    }
    for (const user of data || []) {
      usersById.set(Number(user.id), user);
    }
  }
  return usersById;
}

async function fetchPlusPlans() {
  const { data, error } = await supabase
    .from('user_billing_plans')
    .select('code, name');
  if (error) {
    if (MISSING_SCHEMA_CODES.has(error.code)) return [];
    throw Object.assign(new Error('Không thể tải danh mục gói Plus. Vui lòng thử lại.'), {
      statusCode: 503, code: 'PLUS_ANALYTICS_QUERY_FAILED'
    });
  }
  return Array.isArray(data) ? data : [];
}

async function getPlusSnapshotData() {
  const subscriptions = await fetchAllPlusSubscriptions();
  if (subscriptions === null) return null;

  const uniqueUserIds = [...new Set(subscriptions.map((row) => Number(row.user_id)).filter(Number.isFinite))];
  const [usersById, plans] = await Promise.all([
    uniqueUserIds.length ? fetchUsersByIds(uniqueUserIds) : Promise.resolve(new Map()),
    fetchPlusPlans()
  ]);
  return { subscriptions, usersById, plans };
}

module.exports = { getDashboard, getRevenue, getTransactions, getActiveAgents, getPlusSnapshotData };
