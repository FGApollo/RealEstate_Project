const { badRequest } = require('./businessValidation');
const { propertyTypeKey, PROPERTY_TYPES } = require('./recommendationKeys');
const TYPES = new Set(PROPERTY_TYPES.map(item => item.key));

// Từ khóa địa điểm dạng chữ: chữ thường, bỏ dấu, ký tự khác chữ/số thành khoảng trắng (khớp listing_search_norm ở SQL).
const asciiFold = (value) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const CITY_ALIASES = new Map([['hcm', 'ho chi minh'], ['tphcm', 'ho chi minh'], ['tp hcm', 'ho chi minh'], ['sg', 'ho chi minh'],
  ['hn', 'ha noi'], ['tphn', 'ha noi'], ['dn', 'da nang']]);
const ADMIN_PREFIX = /^(thanh pho|tp|tinh|thi xa|thi tran|quan|q|huyen|phuong|p|xa)\s+(.+)$/;
const NUMBERED_PREFIX = { q: 'quan', quan: 'quan', p: 'phuong', phuong: 'phuong' };
// "Bình Thạnh", "quận Bình Thạnh" -> "binh thanh"; "Q1", "quận 1" -> "quan 1" (giữ tiền tố khi phần sau là số).
const normalizeLocation = (value) => {
  let text = asciiFold(value).replace(/^(q|p)(\d+)$/, '$1 $2');
  if (CITY_ALIASES.has(text)) return CITY_ALIASES.get(text);
  const match = ADMIN_PREFIX.exec(text);
  if (match) {
    const [, prefix, rest] = match;
    text = /^\d+$/.test(rest) ? `${NUMBERED_PREFIX[prefix] || prefix} ${rest}` : rest;
  }
  return CITY_ALIASES.get(text) || text;
};

function parseSearchFilters(value) {
  if (value == null || value === '') return {};
  if (typeof value !== 'string' || value.length > 4096) throw badRequest('Bộ lọc không hợp lệ.');
  let input;
  try { input = JSON.parse(value); } catch { throw badRequest('Bộ lọc không hợp lệ.'); }
  const allowed = ['wards','categories','minPrice','maxPrice','minArea','maxArea','bedrooms','features','city','district','listingType','location',
    'province','ward'];
  if (!input || Array.isArray(input) || typeof input !== 'object' || Object.keys(input).some(key => !allowed.includes(key))) throw badRequest('Bộ lọc không hợp lệ.');
  const result = {};
  for (const key of ['wards','categories','bedrooms','features']) {
    if (input[key] == null) continue;
    if (!Array.isArray(input[key]) || input[key].length > 30 || input[key].some(v => typeof v !== 'string' || v.length > 120 || /[\x00-\x1f]/.test(v))) throw badRequest('Bộ lọc không hợp lệ.');
    let values = [...new Set(input[key].map(v => v.trim()).filter(Boolean))].sort();
    if (key === 'categories') { values = values.map(propertyTypeKey); if (values.some(v => !TYPES.has(v))) throw badRequest('Loại bất động sản không hợp lệ.'); }
    if (key === 'bedrooms' && values.some(v => !/^(0|[1-9]\d?|4\+)$/.test(v))) throw badRequest('Số phòng không hợp lệ.');
    if (key === 'features') values = values.map(v => v.toLocaleLowerCase('vi'));
    if (values.length) result[key] = [...new Set(values)].sort();
  }
  for (const key of ['minPrice','maxPrice','minArea','maxArea']) {
    if (input[key] == null || input[key] === '') continue;
    const max = key.includes('Price') ? 1e15 : 1e9;
    if (!['string','number'].includes(typeof input[key]) || !Number.isFinite(Number(input[key])) || Number(input[key]) < 0 || Number(input[key]) > max) throw badRequest('Khoảng giá/diện tích không hợp lệ.');
    result[key] = Number(input[key]);
  }
  for (const [min,max] of [['minPrice','maxPrice'],['minArea','maxArea']]) if (result[min] != null && result[max] != null && result[min] > result[max]) throw badRequest('Giá trị tối thiểu phải nhỏ hơn tối đa.');
  for (const key of ['city','district','listingType']) {
    if (input[key] == null || input[key] === '') continue;
    if (typeof input[key] !== 'string' || input[key].length > 120 || /[\x00-\x1f]/.test(input[key])) throw badRequest('Khu vực không hợp lệ.');
    result[key] = input[key].trim();
  }
  if (result.listingType && !['RENT','SALE'].includes(result.listingType)) throw badRequest('Loại tin không hợp lệ.');
  // Đơn vị hành chính mới chọn từ dropdown (tỉnh/TP, phường/xã); server khớp cả tin ghi theo đơn vị cũ.
  for (const key of ['province', 'ward']) {
    if (input[key] == null || input[key] === '') continue;
    if (typeof input[key] !== 'string' || input[key].length > 120 || /[\x00-\x1f]/.test(input[key])) throw badRequest('Khu vực không hợp lệ.');
    result[key] = input[key].trim();
  }
  if (result.ward && !result.province) throw badRequest('Chọn tỉnh/thành phố trước khi chọn phường/xã.');
  if (input.location != null && input.location !== '') {
    if (typeof input.location !== 'string' || input.location.length > 120 || /[\x00-\x1f]/.test(input.location)) throw badRequest('Địa điểm không hợp lệ.');
    const location = normalizeLocation(input.location);
    if (location) result.location = location;
  }
  return result;
}
module.exports = { parseSearchFilters, normalizeLocation, asciiFold };
