const repository = require('../repositories/analyticsRepository');
const { parseAnalyticsQuery, parsePagination, parseActiveAgentsQuery } = require('./analyticsQuery');
const {
  getAnalyticsWindow,
  unavailablePlusSubscriptions,
  summarizePlusSubscriptions,
  buildActivePlusUsersPage
} = require('./plusAnalyticsLogic');
const { parseTransactionAudience, parseTransactionSearch } = require('./transactionsAnalyticsLogic');

// An absent ledger is unknown revenue, not zero revenue. No subscription price
// or status is accepted as evidence of a settled payment.
const unavailableRevenue = () => ({
  available: false,
  reason: 'Chưa có dữ liệu thanh toán xác thực',
  currency: 'VND',
  recognition: 'verified_payment_date',
  totalGross: null, currentMonthGross: null, periodGross: null,
  periodRefunds: null, periodNet: null, successfulTransactions: null,
  averageTransaction: null, growthPercent: null,
  trend: [], monthly: [], byPackage: [], bySource: []
});

async function getDashboard(query, now = new Date()) {
  const filters = parseAnalyticsQuery(query, now);
  const [result, revenue, plusData] = await Promise.all([
    repository.getDashboard(filters, now),
    repository.getRevenue(filters, now),
    repository.getPlusSnapshotData().catch(() => null)
  ]);
  const packages = result.packages.map((plan) => ({
    ...plan,
    revenue: revenue
      ? revenue.byPackage
        .filter((item) => item.code === plan.name)
        .reduce((sum, item) => sum + Number(item.gross), 0)
      : null
  }));
  const window = getAnalyticsWindow(filters, now, result.snapshotAt);
  const plusSubscriptions = plusData
    ? summarizePlusSubscriptions({
      subscriptions: plusData.subscriptions,
      usersById: plusData.usersById,
      plans: plusData.plans,
      totalCustomers: result.users?.customers,
      revenueByPackage: revenue?.byPackage || null,
      window
    })
    : unavailablePlusSubscriptions(result.users?.customers);
  return { ...result, packages, plusSubscriptions, filters, revenue: revenue || unavailableRevenue() };
}

async function getTransactions(query, now = new Date()) {
  const { page, limit, audience, search, ...dates } = query;
  const pagination = parsePagination({ ...(page !== undefined ? { page } : {}), ...(limit !== undefined ? { limit } : {}) });
  const parsedAudience = parseTransactionAudience(audience);
  const parsedSearch = parseTransactionSearch(search);
  const filters = parseAnalyticsQuery(dates, now);
  return await repository.getTransactions(filters, pagination, now, parsedAudience, parsedSearch)
    || { available: false, reason: 'Chưa có dữ liệu thanh toán xác thực', items: [], total: null, ...pagination };
}

async function getActiveAgents(query, now = new Date()) {
  return repository.getActiveAgents(parseActiveAgentsQuery(query, now));
}

async function getActivePlusUsers(query, now = new Date()) {
  const parsed = parseActiveAgentsQuery(query, now);
  if (typeof repository.getActivePlusUsers === 'function') {
    const rpcPage = await repository.getActivePlusUsers(parsed);
    if (rpcPage) return rpcPage;
  }
  const plusData = await repository.getPlusSnapshotData({ activeAfterIso: parsed.snapshotAt });
  if (!plusData) {
    throw Object.assign(new Error('Danh sách khách hàng Plus chưa được cấu hình. Vui lòng thử lại sau.'), {
      statusCode: 503,
      code: 'ACTIVE_PLUS_USERS_NOT_CONFIGURED'
    });
  }
  return buildActivePlusUsersPage({
    subscriptions: plusData.subscriptions,
    usersById: plusData.usersById,
    plans: plusData.plans,
    ...parsed
  });
}

module.exports = { getDashboard, getTransactions, getActiveAgents, getActivePlusUsers };
