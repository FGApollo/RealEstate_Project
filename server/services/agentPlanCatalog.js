const TIER_CODES = ['LITE','PLUS','PRO'];
function assertTierCatalog(plans) {
  if (!Array.isArray(plans) || plans.length !== 3 || !TIER_CODES.every(code => plans.some(plan => plan.code === code))
    || plans.some(plan => !Number.isInteger(plan.listing_limit) || plan.listing_limit < 1
      || !Number.isInteger(plan.priority_points) || plan.priority_points < 0 || !TIER_CODES.includes(plan.support_tier))) {
    throw Object.assign(new Error('Cấu hình Lite, Plus, Pro chưa sẵn sàng. Quản trị viên cần áp dụng migration 018 trước khi sử dụng.'), { statusCode: 503, code: 'PLAN_MIGRATION_REQUIRED' });
  }
  return plans;
}
module.exports = { TIER_CODES, assertTierCatalog };
