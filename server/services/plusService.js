const { supabase } = require('../config/supabase');

// Gói Swipe Nest Plus của người dùng (migration 026). Trạng thái luôn đọc từ DB, không lưu trong session.
const PLUS_REQUIRED_MESSAGE = 'Tin này do đội Swipe Nest đăng. Nâng cấp Swipe Nest Plus (20.000đ/tháng) để nhắn tin và xem liên hệ.';

const serviceError = (message, statusCode, code) => Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });

const getPlusState = async (userId) => {
  try {
    const { data, error } = await supabase.rpc('user_plus_state', { p_user_id: userId });
    if (error) {
      if (['PGRST202', '42883', 'PGRST205', '42P01'].includes(error.code)
        || error.message?.includes('user_plus_state')) {
        return { active: false, currentEnd: null, periods: [] };
      }
      return { active: false, currentEnd: null, periods: [] };
    }
    return {
      active: data?.active === true,
      currentEnd: data?.current_end || null,
      periods: Array.isArray(data?.periods) ? data.periods.map((period) => ({
        startDate: period.start_date, endDate: period.end_date, source: period.source
      })) : []
    };
  } catch (err) {
    return { active: false, currentEnd: null, periods: [] };
  }
};

const isPlusActive = async (userId) => (await getPlusState(userId)).active;

const isOfficialUser = async (userId) => {
  const { data, error } = await supabase.from('users').select('is_official').eq('id', userId).maybeSingle();
  if (error) {
    if (error.code === '42703' || error.message?.includes('is_official')) return false;
    throw serviceError('Chưa thể kiểm tra tài khoản.', 503);
  }
  return data?.is_official === true;
};

// Người liên hệ tài khoản chính thức phải có Plus. Admin, môi giới và chính tài khoản chính thức thì không cần.
const assertPlusForOfficialContact = async (requesterId) => {
  const { data: requester, error } = await supabase.from('users').select('id, role').eq('id', requesterId).maybeSingle();
  if (error) throw serviceError('Chưa thể kiểm tra tài khoản.', 503);
  if (!requester || String(requester.role).toUpperCase() !== 'USER') return;
  if (!(await isPlusActive(requesterId))) throw serviceError(PLUS_REQUIRED_MESSAGE, 403, 'PLUS_REQUIRED');
};

module.exports = { PLUS_REQUIRED_MESSAGE, getPlusState, isPlusActive, isOfficialUser, assertPlusForOfficialContact };
