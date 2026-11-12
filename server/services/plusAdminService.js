const { supabase } = require('../config/supabase');
const { badRequest, positiveId, text } = require('./businessValidation');

// Admin: cấp / gỡ gói Plus của người dùng, bật tài khoản chính thức, gắn nhãn "Swipe Nest đã kiểm tra" (migration 026).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

async function call(name, args, notFound = 'Không tìm thấy tài khoản.') {
  const { data, error } = await supabase.rpc(name, args);
  if (!error) return data;
  if (error.code === '42501') throw fail(403, 'Chỉ Admin đang hoạt động được thực hiện thao tác này.', 'ADMIN_FORBIDDEN');
  if (error.code === 'P0002') throw fail(404, notFound, 'NOT_FOUND');
  if (error.code === '23505') throw fail(409, 'Người dùng hiện không có gói Plus nào đang chạy.', 'PLUS_CONFLICT');
  if (error.code === '22023') throw fail(400, 'Số tháng hoặc lý do không hợp lệ.', 'PLUS_INVALID');
  if (['PGRST202', '42883', '42P01'].includes(error.code)) {
    throw fail(503, 'Database chưa có migration 026 (gói Plus và tài khoản chính thức).', 'PLUS_MIGRATION_REQUIRED');
  }
  throw fail(503, 'Không thể cập nhật lúc này. Vui lòng thử lại.', 'PLUS_UNAVAILABLE');
}

const parseRequest = (body, fields) => {
  const allowed = ['requestId', 'reason', ...fields];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw badRequest('Thông tin yêu cầu không hợp lệ.');
  }
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) throw badRequest('Mã yêu cầu không hợp lệ.');
  const reason = text(body.reason, 'lý do', 500, { required: true });
  if (reason.length < 5) throw badRequest('Nhập lý do từ 5 đến 500 ký tự.');
  if (fields.includes('months') && (!Number.isInteger(body.months) || body.months < 1 || body.months > 12)) {
    throw badRequest('Số tháng phải từ 1 đến 12.');
  }
  return { ...body, reason };
};

module.exports = {
  async lookupUser(actorId, query = {}) {
    const id = query.id !== undefined && query.id !== '' ? positiveId(query.id, 'id') : null;
    const email = typeof query.email === 'string' && query.email.trim() ? query.email.trim().slice(0, 254) : null;
    if (!id && !email) throw badRequest('Nhập email hoặc ID người dùng.');
    return call('admin_user_plus', { p_actor_id: actorId, p_user_id: id, p_email: id ? null : email }, 'Không tìm thấy người dùng (vai trò USER).');
  },
  async grant(actorId, userId, body) {
    const input = parseRequest(body, ['months']);
    return call('admin_grant_user_plus', { p_actor_id: actorId, p_request_id: input.requestId,
      p_user_id: positiveId(userId, 'userId'), p_months: input.months, p_reason: input.reason });
  },
  async remove(actorId, userId, body) {
    const input = parseRequest(body, []);
    return call('admin_remove_user_plus', { p_actor_id: actorId, p_request_id: input.requestId,
      p_user_id: positiveId(userId, 'userId'), p_reason: input.reason });
  },
  async setOfficial(actorId, agentId, body) {
    if (!body || typeof body.official !== 'boolean' || Object.keys(body).some((key) => key !== 'official')) {
      throw badRequest('Thông tin tài khoản chính thức không hợp lệ.');
    }
    return call('admin_set_official_account', { p_actor_id: actorId, p_user_id: positiveId(agentId, 'agentId'), p_official: body.official },
      'Không tìm thấy môi giới.');
  }
};
