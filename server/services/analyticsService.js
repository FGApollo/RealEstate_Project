const repository = require('../repositories/analyticsRepository');
const { parseAnalyticsQuery, parsePagination, parseActiveAgentsQuery } = require('./analyticsQuery');

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
  const [result, revenue] = await Promise.all([repository.getDashboard(filters, now), repository.getRevenue(filters, now)]);
  const packages = result.packages.map((plan) => ({ ...plan, revenue: revenue ? revenue.byPackage
    .filter((item) => item.code === plan.name).reduce((sum, item) => sum + Number(item.gross), 0) : null }));
  return { ...result, packages, filters, revenue: revenue || unavailableRevenue() };
}

async function getTransactions(query, now = new Date()) {
  const { page, limit, ...dates } = query;
  const pagination = parsePagination({ ...(page !== undefined ? { page } : {}), ...(limit !== undefined ? { limit } : {}) });
  const filters = parseAnalyticsQuery(dates, now);
  return await repository.getTransactions(filters, pagination, now)
    || { available: false, reason: 'Chưa có dữ liệu thanh toán xác thực', items: [], total: null, ...pagination };
}

async function getActiveAgents(query, now = new Date()) {
  return repository.getActiveAgents(parseActiveAgentsQuery(query, now));
}
module.exports = { getDashboard, getTransactions, getActiveAgents };
