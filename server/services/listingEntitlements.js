const { supabase } = require('../config/supabase');
const errors = {
  LISTING_QUOTA_EXCEEDED: [409, 'Bạn đã đạt giới hạn tin công khai của gói. Hãy ẩn/kết thúc một tin hoặc đăng ký gói phù hợp.'],
  LISTING_SUBSCRIPTION_REQUIRED: [403, 'Bạn cần gói dịch vụ còn hiệu lực để công khai tin đăng.'],
  LISTING_OWNER_INELIGIBLE: [403, 'Tài khoản chưa đủ điều kiện công khai tin. Hãy kiểm tra xác minh danh tính và điểm uy tín.']
};
function listingDatabaseError(error) {
  const key = Object.keys(errors).find(key => error?.message?.includes(key));
  return key ? Object.assign(new Error(errors[key][1]), { statusCode: errors[key][0], code: key }) : new Error('Không thể lưu tin đăng lúc này.');
}
async function assertListingCapacity(userId) {
  const { data, error } = await supabase.rpc('agent_subscription_state', { p_user_id: userId });
  if (error) throw Object.assign(new Error('Chưa thể kiểm tra quyền đăng tin. Vui lòng thử lại.'), { statusCode: 503 });
  const now = Date.now();
  const date = value => new Date(/[Zz]|[+-]\d\d:\d\d$/.test(value || '') ? value : `${value}Z`).getTime();
  if (!data || data.status !== 'ACTIVE' || !(date(data.start_date) <= now && date(data.end_date) > now)) {
    throw listingDatabaseError({ message: 'LISTING_SUBSCRIPTION_REQUIRED' });
  }
  if (data.public_listing_count >= data.listing_limit) throw listingDatabaseError({ message: 'LISTING_QUOTA_EXCEEDED' });
  // The database trigger checks again under the account lock at insert/unhide.
  return data;
}
module.exports = { listingDatabaseError, assertListingCapacity };
