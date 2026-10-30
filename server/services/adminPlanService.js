const { supabase } = require('../config/supabase');
const { badRequest, positiveId, text } = require('./businessValidation');
const { parsePagination } = require('./analyticsQuery');
const { assertTierCatalog } = require('./agentPlanCatalog');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (!error) return data;
  if (error.code === '42501') throw fail(403, 'Chỉ Admin đang hoạt động được quản lý giá.', 'PLAN_FORBIDDEN');
  if (['40001','23505'].includes(error.code)) throw fail(409,
    'Cấu hình đã thay đổi hoặc đang có lịch chờ. Hãy làm mới, kiểm tra lịch và thử lại.', 'PLAN_CONFLICT');
  if (error.code === '22023') throw fail(400, 'Giá, chu kỳ hoặc thời điểm áp dụng không hợp lệ.', 'PLAN_INVALID');
  throw fail(503, 'Quản lý gói dịch vụ chưa sẵn sàng. Vui lòng thử lại hoặc liên hệ quản trị hệ thống.', 'PLAN_UNAVAILABLE');
}

function parseChange(body, now = new Date()) {
  const allowed = ['planCode','requestId','expectedVersion','amount','durationMonths','active','effectiveAt','reason','action'];
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(key => !allowed.includes(key))) {
    throw badRequest('Thông tin cập nhật không hợp lệ.');
  }
  if (!['LITE','PLUS','PRO'].includes(body.planCode) || typeof body.requestId !== 'string' || !UUID.test(body.requestId) || !Number.isSafeInteger(body.expectedVersion)
    || body.expectedVersion < 1 || body.expectedVersion > 2147483647
    || !['SAVE','CANCEL'].includes(body.action)) throw badRequest('Mã yêu cầu hoặc phiên bản cấu hình không hợp lệ.');
  const reason = text(body.reason, 'lý do thay đổi', 500, { required: true });
  if (reason.length < 5) throw badRequest('Nhập lý do thay đổi từ 5 đến 500 ký tự.');
  if (body.action === 'CANCEL') {
    if (['amount','durationMonths','active','effectiveAt'].some(key => body[key] !== undefined)) throw badRequest('Yêu cầu hủy lịch không hợp lệ.');
    return { ...body, reason, amount: null, durationMonths: null, active: null, effectiveAt: null };
  }
  if (!Number.isSafeInteger(body.amount) || body.amount < 2000 || body.amount > 500000000
    || !Number.isInteger(body.durationMonths) || body.durationMonths < 1 || body.durationMonths > 12
    || typeof body.active !== 'boolean') throw badRequest('Giá phải từ 2.000 đến 500.000.000đ; chu kỳ từ 1 đến 12 tháng.');
  let effectiveAt = null;
  if (body.effectiveAt != null) {
    if (typeof body.effectiveAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(body.effectiveAt)) {
      throw badRequest('Thời điểm áp dụng phải bao gồm múi giờ.');
    }
    const [year, month, day] = body.effectiveAt.slice(0, 10).split('-').map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== body.effectiveAt.slice(0, 10)) {
      throw badRequest('Ngày áp dụng không tồn tại trong lịch.');
    }
    const date = new Date(body.effectiveAt);
    if (!Number.isFinite(date.getTime()) || date < new Date(now.getTime() + 5 * 60000)
      || date > new Date(now.getTime() + 365 * 86400000)) throw badRequest('Chọn lịch sau ít nhất 5 phút và trong vòng 365 ngày.');
    effectiveAt = date.toISOString();
  }
  return { ...body, reason, effectiveAt };
}

module.exports = {
  parseChange,
  async catalog(actorId) {
    const data = await call('admin_agent_plan_catalog', { p_actor_id: positiveId(actorId) });
    assertTierCatalog(data.plans);
    return data;
  },
  history(actorId, query) {
    const { page, limit } = parsePagination(query);
    return call('admin_agent_plan_history', { p_actor_id: positiveId(actorId), p_page: page, p_limit: limit });
  },
  change(actorId, input) {
    const body = parseChange(input);
    return call('admin_change_agent_plan', { p_actor_id: positiveId(actorId), p_request_id: body.requestId,
      p_expected_version: body.expectedVersion, p_amount: body.amount, p_duration: body.durationMonths,
      p_active: body.active, p_effective_at: body.effectiveAt, p_reason: body.reason, p_action: body.action, p_plan_code: body.planCode });
  }
};
