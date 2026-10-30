const { badRequest } = require('./businessValidation');
const { propertyTypeKey, PROPERTY_TYPES } = require('./recommendationKeys');
const TYPES = new Set(PROPERTY_TYPES.map(item => item.key));
function parseSearchFilters(value) {
  if (value == null || value === '') return {};
  if (typeof value !== 'string' || value.length > 4096) throw badRequest('Bộ lọc không hợp lệ.');
  let input;
  try { input = JSON.parse(value); } catch { throw badRequest('Bộ lọc không hợp lệ.'); }
  const allowed = ['wards','categories','minPrice','maxPrice','minArea','maxArea','bedrooms','features','city','district','listingType'];
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
  return result;
}
module.exports = { parseSearchFilters };
