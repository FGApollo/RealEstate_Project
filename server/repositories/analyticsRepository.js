const { supabase } = require('../config/supabase');
const { getTransactionsWindowIso, normalizeTransactionRow } = require('../services/transactionsAnalyticsLogic');

const MISSING_SCHEMA_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01', '42703']);
const MISSING_TABLE_CODES = new Set(['PGRST202', 'PGRST205', '42883', '42P01']);
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

async function getLegacyTransactions(filters, pagination, now, audience) {
  const legacy = await paymentRpc('admin_payment_transactions', {
    p_start: filters.start, p_end: filters.end, p_page: pagination.page, p_limit: pagination.limit, p_as_of: now.toISOString()
  });
  if (!legacy) return null;
  const total = Number(legacy.total || 0);
  if (audience === 'USER') {
    return {
      available: true,
      audience,
      total: 0,
      counts: { all: total, agent: total, user: 0 },
      page: pagination.page,
      limit: pagination.limit,
      items: []
    };
  }
  const items = (legacy.items || []).map((item) => ({
    ...item,
    audience: 'AGENT',
    accountName: item.agent || 'Môi giới',
    accountEmail: null
  }));
  return {
    ...legacy,
    audience,
    counts: { all: total, agent: total, user: 0 },
    items
  };
}

async function getTransactions(filters, pagination, now, audience = 'ALL') {
  const { startIso, cutoffIso } = getTransactionsWindowIso(filters, now);
  const offset = (pagination.page - 1) * pagination.limit;

  let listQuery = supabase
    .from('agent_payment_orders')
    .select('id, order_code, user_id, plan_code, plan_name, amount_vnd, currency, status, audience, created_at, paid_at', { count: 'exact' })
    .gte('created_at', startIso)
    .lt('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(offset, offset + pagination.limit - 1);
  if (audience === 'AGENT' || audience === 'USER') {
    listQuery = listQuery.eq('audience', audience);
  }

  const countByAudience = (target) => supabase
    .from('agent_payment_orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startIso)
    .lt('created_at', cutoffIso)
    .eq('audience', target);

  const [listRes, agentCountRes, userCountRes] = await Promise.all([
    listQuery,
    countByAudience('AGENT'),
    countByAudience('USER')
  ]);

  if (listRes.error) {
    if (MISSING_TABLE_CODES.has(listRes.error.code)) return null;
    if (listRes.error.code === '42703') return getLegacyTransactions(filters, pagination, now, audience);
    throw Object.assign(new Error('Không thể tải thống kê thanh toán.'), { statusCode: 503 });
  }
  if (agentCountRes.error || userCountRes.error) {
    throw Object.assign(new Error('Không thể tải thống kê thanh toán.'), { statusCode: 503 });
  }

  const rows = Array.isArray(listRes.data) ? listRes.data : [];
  const uniqueUserIds = [...new Set(rows.map((row) => Number(row.user_id)).filter(Number.isFinite))];
  const usersById = uniqueUserIds.length ? await fetchUsersByIds(uniqueUserIds) : new Map();
  const agentCount = Number(agentCountRes.count || 0);
  const userCount = Number(userCountRes.count || 0);

  return {
    available: true,
    audience,
    total: Number(listRes.count || 0),
    counts: {
      all: agentCount + userCount,
      agent: agentCount,
      user: userCount
    },
    page: pagination.page,
    limit: pagination.limit,
    items: rows.map((row) => normalizeTransactionRow(row, usersById))
  };
}

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
      throw Object.assign(new Error('Không thể tải thông tin tài khoản. Vui lòng thử lại.'), {
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
