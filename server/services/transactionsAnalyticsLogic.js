const DAY_MS = 86400000;
const VN_OFFSET = '+07:00';
const VALID_AUDIENCES = new Set(['ALL', 'AGENT', 'USER']);

function parseTransactionAudience(value) {
  if (value === undefined || value === '') return 'ALL';
  if (typeof value !== 'string') {
    throw Object.assign(new Error('Đối tượng giao dịch không hợp lệ.'), { statusCode: 400 });
  }
  const normalized = value.trim().toUpperCase();
  if (!VALID_AUDIENCES.has(normalized)) {
    throw Object.assign(new Error('Đối tượng giao dịch không hợp lệ.'), { statusCode: 400 });
  }
  return normalized;
}

function parseTransactionSearch(value) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') {
    throw Object.assign(new Error('Từ khóa tìm kiếm giao dịch không hợp lệ.'), { statusCode: 400 });
  }
  const trimmed = value.trim();
  if (trimmed.length > 120) {
    throw Object.assign(new Error('Từ khóa tìm kiếm tối đa 120 ký tự.'), { statusCode: 400 });
  }
  return trimmed;
}

function normalizeSearchToken(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();
}

function matchesAccountSearch(user, search) {
  const needle = normalizeSearchToken(search);
  if (!needle) return true;
  if (!user) return false;
  return normalizeSearchToken(user.name).includes(needle)
    || normalizeSearchToken(user.email).includes(needle);
}

function getTransactionsWindowIso(filters, now = new Date()) {
  const startMs = Date.parse(`${filters.start}T00:00:00${VN_OFFSET}`);
  const endMs = Date.parse(`${filters.end}T00:00:00${VN_OFFSET}`) + DAY_MS;
  const cutoffMs = Math.min(endMs, now.getTime());
  return {
    startIso: new Date(startMs).toISOString(),
    cutoffIso: new Date(cutoffMs).toISOString()
  };
}

function resolveOrderAudience(row, user) {
  const explicit = String(row?.audience || '').trim().toUpperCase();
  if (explicit === 'USER' || explicit === 'AGENT') return explicit;
  if (String(row?.plan_code || '').trim().toUpperCase() === 'USER_PLUS') return 'USER';
  if (String(user?.role || '').trim().toUpperCase() === 'USER') return 'USER';
  return 'AGENT';
}

function normalizeTransactionRow(row, usersById = new Map()) {
  const user = usersById.get(Number(row.user_id)) || null;
  const audience = resolveOrderAudience(row, user);
  const trimmedName = typeof user?.name === 'string' ? user.name.trim() : '';
  const fallbackName = audience === 'USER' ? 'Khách hàng' : 'Môi giới';
  const accountName = trimmedName || fallbackName;
  return {
    id: row.id,
    orderCode: row.order_code,
    audience,
    agent: accountName,
    accountName,
    accountEmail: user?.email ?? null,
    planCode: row.plan_code ?? null,
    planName: row.plan_name,
    amount: Number(row.amount_vnd ?? 0),
    currency: row.currency || 'VND',
    status: row.status,
    createdAt: row.created_at,
    paidAt: row.paid_at ?? null
  };
}

module.exports = {
  parseTransactionAudience,
  parseTransactionSearch,
  normalizeSearchToken,
  matchesAccountSearch,
  getTransactionsWindowIso,
  resolveOrderAudience,
  normalizeTransactionRow
};
