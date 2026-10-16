const repository = require('../repositories/analyticsRepository');
const { parseAnalyticsQuery, parsePagination } = require('./analyticsQuery');

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
  const result = await repository.getDashboard(filters, now);
  return { ...result, filters, revenue: unavailableRevenue() };
}

function getTransactions(query) {
  const pagination = parsePagination(query);
  return { available: false, reason: 'Chưa có dữ liệu thanh toán xác thực', items: [], total: null, ...pagination };
}

module.exports = { getDashboard, getTransactions };
