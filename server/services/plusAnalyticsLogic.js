const DAY_MS = 86400000;
const VN_OFFSET = '+07:00';
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const DEFAULT_PLAN_NAME = 'Swipe Nest Plus';
const PLUS_FALLBACK_CODES = new Set(['USER_PLUS']);

function parseUtcTimestamp(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(normalized);
  const ms = Date.parse(hasZone ? normalized : `${normalized}Z`);
  return Number.isFinite(ms) ? ms : null;
}

function getAnalyticsWindow(filters, now = new Date(), snapshotAt = null) {
  const startMs = Date.parse(`${filters.start}T00:00:00${VN_OFFSET}`);
  const endMs = Date.parse(`${filters.end}T00:00:00${VN_OFFSET}`) + DAY_MS;
  const previousStartMs = startMs - filters.days * DAY_MS;
  const snapshotMs = snapshotAt ? parseUtcTimestamp(snapshotAt) : null;
  const cutoffMs = snapshotMs != null ? snapshotMs : Math.min(endMs, now.getTime());
  return { startMs, endMs, previousStartMs, cutoffMs };
}

function isCustomerAtCutoff(user, cutoffMs) {
  if (!user || String(user.role || '').toUpperCase() !== 'USER') return false;
  const createdMs = parseUtcTimestamp(user.created_at);
  return createdMs == null || createdMs < cutoffMs;
}

function compareDesc(a, b) {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return b - a;
}

function isNewerPeriod(candidate, current) {
  const startDiff = compareDesc(candidate.startMs, current.startMs);
  if (startDiff !== 0) return startDiff < 0;
  const createdDiff = compareDesc(candidate.createdMs, current.createdMs);
  if (createdDiff !== 0) return createdDiff < 0;
  return Number(candidate.id || 0) > Number(current.id || 0);
}

function normalizeSource(source) {
  return String(source || '').toUpperCase() === 'ADMIN' ? 'ADMIN' : 'PAYOS';
}

function resolvePlanName(planCode, planNamesByCode) {
  const code = String(planCode || '').trim();
  if (code && planNamesByCode?.get(code)) return planNamesByCode.get(code);
  return DEFAULT_PLAN_NAME;
}

function buildPlanNameMap(plans = []) {
  const map = new Map();
  for (const plan of plans || []) {
    const code = String(plan?.code || '').trim();
    const name = String(plan?.name || '').trim();
    if (code && name) map.set(code, name);
  }
  return map;
}

function prepareEligibleRows(subscriptions, usersById, cutoffMs) {
  const eligible = [];
  for (const row of subscriptions || []) {
    const user = usersById.get(Number(row.user_id));
    if (!isCustomerAtCutoff(user, cutoffMs)) continue;
    const createdMs = parseUtcTimestamp(row.created_at);
    if (createdMs != null && createdMs >= cutoffMs) continue;
    eligible.push({
      id: Number(row.id || 0),
      userId: Number(row.user_id),
      planCode: String(row.plan_code || 'USER_PLUS').trim() || 'USER_PLUS',
      status: String(row.status || '').toUpperCase(),
      source: normalizeSource(row.source),
      startMs: parseUtcTimestamp(row.start_date),
      endMs: parseUtcTimestamp(row.end_date),
      createdMs,
      user
    });
  }
  return eligible;
}

function selectActiveUsersMap(eligibleRows, cutoffMs) {
  const activeByUser = new Map();
  const maxEndByUser = new Map();
  const periodCountByUser = new Map();

  for (const row of eligibleRows) {
    if (row.status !== 'ACTIVE' || row.startMs == null || row.endMs == null) continue;
    if (row.endMs <= cutoffMs) continue;

    const prevMax = maxEndByUser.get(row.userId);
    if (prevMax == null || row.endMs > prevMax) maxEndByUser.set(row.userId, row.endMs);
    periodCountByUser.set(row.userId, (periodCountByUser.get(row.userId) || 0) + 1);

    if (row.startMs <= cutoffMs) {
      const existing = activeByUser.get(row.userId);
      if (!existing || isNewerPeriod(row, existing)) activeByUser.set(row.userId, row);
    }
  }

  return { activeByUser, maxEndByUser, periodCountByUser };
}

function unavailablePlusSubscriptions(totalCustomers = 0, reason = 'Chưa có dữ liệu gói Plus trong cơ sở dữ liệu.') {
  const total = Math.max(0, Number(totalCustomers || 0));
  return {
    available: false,
    reason,
    planName: DEFAULT_PLAN_NAME,
    totalCustomers: total,
    records: 0,
    everSubscribed: 0,
    activeUsers: 0,
    neverSubscribed: total,
    withoutActive: total,
    adoptionRate: 0,
    newRecords: 0,
    previousNewRecords: 0,
    newGrowthPercent: null,
    expiredRecords: 0,
    cancelledRecords: 0,
    endedInPeriod: 0,
    unknownDates: 0,
    periodRevenue: null,
    sources: []
  };
}

function summarizePlusSubscriptions({
  subscriptions = [],
  usersById = new Map(),
  plans = [],
  totalCustomers = 0,
  revenueByPackage = null,
  window
}) {
  const { startMs, previousStartMs, cutoffMs } = window;
  const planNamesByCode = buildPlanNameMap(plans);
  const eligible = prepareEligibleRows(subscriptions, usersById, cutoffMs);
  const { activeByUser } = selectActiveUsersMap(eligible, cutoffMs);

  const everUsers = new Set();
  let newRecords = 0;
  let previousNewRecords = 0;
  let expiredRecords = 0;
  let cancelledRecords = 0;
  let endedInPeriod = 0;
  let unknownDates = 0;
  const newBySource = { PAYOS: 0, ADMIN: 0 };

  for (const row of eligible) {
    everUsers.add(row.userId);
    if (row.startMs == null || row.endMs == null || row.createdMs == null) unknownDates += 1;
    if (row.createdMs != null && row.createdMs >= startMs) {
      newRecords += 1;
      newBySource[row.source] += 1;
    } else if (row.createdMs != null && row.createdMs >= previousStartMs && row.createdMs < startMs) {
      previousNewRecords += 1;
    }

    if (row.status === 'EXPIRED' || (row.status === 'ACTIVE' && row.endMs != null && row.endMs <= cutoffMs)) {
      expiredRecords += 1;
    }
    if (row.status === 'CANCELLED' || row.status === 'CANCELED') {
      cancelledRecords += 1;
    }
    if (row.endMs != null && row.endMs >= startMs && row.endMs < cutoffMs && (row.status === 'ACTIVE' || row.status === 'EXPIRED')) {
      endedInPeriod += 1;
    }
  }

  const activeBySource = { PAYOS: 0, ADMIN: 0 };
  for (const activeRow of activeByUser.values()) {
    activeBySource[activeRow.source] += 1;
  }

  const customersTotal = Math.max(0, Number(totalCustomers || 0));
  const activeUsers = activeByUser.size;
  const everSubscribed = Math.min(everUsers.size, customersTotal);
  const neverSubscribed = Math.max(0, customersTotal - everSubscribed);
  const withoutActive = Math.max(0, customersTotal - activeUsers);
  const adoptionRate = customersTotal > 0 ? (activeUsers * 100) / customersTotal : 0;
  const newGrowthPercent = previousNewRecords > 0
    ? ((newRecords - previousNewRecords) * 100) / previousNewRecords
    : null;

  const plusCodes = new Set([...PLUS_FALLBACK_CODES, ...planNamesByCode.keys()]);
  const periodRevenue = Array.isArray(revenueByPackage)
    ? revenueByPackage
      .filter((item) => plusCodes.has(String(item?.code || '').trim()))
      .reduce((sum, item) => sum + Number(item.gross || 0), 0)
    : null;

  const sources = [
    {
      code: 'PAYOS',
      name: 'Thanh toán payOS',
      activeUsers: activeBySource.PAYOS,
      sharePercent: activeUsers > 0 ? (activeBySource.PAYOS * 100) / activeUsers : 0,
      newSubscriptions: newBySource.PAYOS
    },
    {
      code: 'ADMIN',
      name: 'Admin cấp',
      activeUsers: activeBySource.ADMIN,
      sharePercent: activeUsers > 0 ? (activeBySource.ADMIN * 100) / activeUsers : 0,
      newSubscriptions: newBySource.ADMIN
    }
  ];

  return {
    available: true,
    planName: planNamesByCode.get('USER_PLUS') || DEFAULT_PLAN_NAME,
    totalCustomers: customersTotal,
    records: eligible.length,
    everSubscribed,
    activeUsers,
    neverSubscribed,
    withoutActive,
    adoptionRate,
    newRecords,
    previousNewRecords,
    newGrowthPercent,
    expiredRecords,
    cancelledRecords,
    endedInPeriod,
    unknownDates,
    periodRevenue,
    sources
  };
}

function buildActivePlusUsersPage({
  subscriptions = [],
  usersById = new Map(),
  plans = [],
  snapshotAt,
  page = 1,
  limit = 10
}) {
  const cutoffMs = parseUtcTimestamp(snapshotAt);
  const planNamesByCode = buildPlanNameMap(plans);
  const eligible = prepareEligibleRows(subscriptions, usersById, cutoffMs);
  const { activeByUser, maxEndByUser, periodCountByUser } = selectActiveUsersMap(eligible, cutoffMs);

  const allItems = [];
  for (const [userId, row] of activeByUser.entries()) {
    const trimmedName = typeof row.user.name === 'string' ? row.user.name.trim() : '';
    const effectiveEndMs = maxEndByUser.get(userId) ?? row.endMs;
    allItems.push({
      userId,
      name: trimmedName || `Khách hàng #${userId}`,
      email: row.user.email ?? null,
      accountActive: row.user.is_active ?? null,
      planName: resolvePlanName(row.planCode, planNamesByCode),
      source: row.source,
      activePeriods: periodCountByUser.get(userId) || 1,
      startDate: new Date(row.startMs).toISOString(),
      endDate: new Date(effectiveEndMs).toISOString(),
      _endMs: effectiveEndMs
    });
  }

  allItems.sort((a, b) => (a._endMs - b._endMs) || (a.userId - b.userId));
  const offset = (page - 1) * limit;
  const items = allItems.slice(offset, offset + limit).map(({ _endMs, ...item }) => item);

  return {
    snapshotAt,
    timeZone: TIME_ZONE,
    total: allItems.length,
    page,
    limit,
    items
  };
}

module.exports = {
  parseUtcTimestamp,
  getAnalyticsWindow,
  unavailablePlusSubscriptions,
  summarizePlusSubscriptions,
  buildActivePlusUsersPage
};
