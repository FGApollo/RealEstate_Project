const DAY_MS = 86400000;
const TIME_ZONE = 'Asia/Ho_Chi_Minh';
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const localToday = (now) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
const dateNumber = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw fail('Ngày phải có định dạng YYYY-MM-DD.');
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw fail('Ngày không hợp lệ.');
  return ms;
};

function parseAnalyticsQuery(query = {}, now = new Date()) {
  const allowed = new Set(['preset', 'start', 'end', 'bucket']);
  if (Object.keys(query).some((key) => !allowed.has(key))) throw fail('Tham số thống kê không được hỗ trợ.');
  for (const value of Object.values(query)) {
    if (typeof value !== 'string') throw fail('Tham số phải là một giá trị duy nhất.');
  }
  const today = localToday(now);
  const preset = query.preset || (query.start || query.end ? 'custom' : '30d');
  if (!['7d', '30d', '90d', '12m', 'custom'].includes(preset)) throw fail('Khoảng thời gian không hợp lệ.');
  let start;
  let end;
  if (preset === 'custom') {
    start = query.start;
    end = query.end;
  } else {
    if (query.start || query.end) throw fail('Chỉ gửi ngày bắt đầu/kết thúc với khoảng tùy chỉnh.');
    end = today;
    const endMs = dateNumber(end);
    start = preset === '12m'
      ? new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 12, 1)).toISOString().slice(0, 10)
      : new Date(endMs - (Number(preset.slice(0, -1)) - 1) * DAY_MS).toISOString().slice(0, 10);
  }
  const days = (dateNumber(end) - dateNumber(start)) / DAY_MS + 1;
  if (start < '2000-01-01' || end > today || days < 1 || days > 3660) throw fail('Chọn tối đa 10 năm, từ năm 2000 đến hôm nay.');
  const bucket = query.bucket || (days <= 90 ? 'day' : days <= 730 ? 'month' : 'year');
  if (!['day', 'week', 'month', 'year'].includes(bucket)) throw fail('Đơn vị thời gian không hợp lệ.');
  if ((bucket === 'day' && days > 366) || (bucket === 'week' && days > 2793)) throw fail('Quá nhiều điểm biểu đồ. Hãy chọn đơn vị thời gian lớn hơn.');
  return { start, end, bucket, preset, days, timeZone: TIME_ZONE };
}

function parsePagination(query = {}) {
  if (Object.keys(query).some((key) => !['page', 'limit'].includes(key))) throw fail('Tham số phân trang không hợp lệ.');
  const integer = (value, fallback, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || Number(value) > max) throw fail('Giá trị phân trang không hợp lệ.');
    return Number(value);
  };
  return { page: integer(query.page, 1, 10000), limit: integer(query.limit, 10, 50) };
}

module.exports = { parseAnalyticsQuery, parsePagination, TIME_ZONE };
