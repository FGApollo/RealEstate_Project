const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

const positiveId = (value, name = 'id') => {
  if ((typeof value !== 'string' && typeof value !== 'number')
    || !/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw badRequest(`Valid ${name} is required.`);
  }
  return Number(value);
};

const boundedInteger = (value, fallback, min, max) => {
  if (value === undefined) return fallback;
  const number = Number(value);
  if ((typeof value !== 'string' && typeof value !== 'number') || !Number.isSafeInteger(number)
    || number < min || number > max) throw badRequest('Invalid pagination value.');
  return number;
};

const text = (value, name, max, { required = false } = {}) => {
  if (value === undefined || value === null) {
    if (required) throw badRequest(`${name} is required.`);
    return '';
  }
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || (required && !value.trim())) throw badRequest(`Invalid ${name}.`);
  return value.trim();
};

const propertyInput = (body, { partial = false } = {}) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Invalid listing data.');
  const limits = { title: 240, description: 20000, property_type: 80, city: 120, district: 120,
    ward: 120, floor_range: 80, address: 500, address_detail: 500, contact_phone: 32 };
  for (const [key, max] of Object.entries(limits)) {
    if (body[key] !== undefined) text(body[key], key, max, { required: ['title', 'property_type'].includes(key) });
  }
  if (!partial) {
    text(body.title, 'title', 240, { required: true });
    text(body.property_type, 'property_type', 80, { required: true });
  }
  if ((!partial || body.listing_type !== undefined) && !['RENT', 'SALE'].includes(body.listing_type)) {
    throw badRequest('Chọn tin cho thuê hoặc mua bán.');
  }
  if (body.status !== undefined && !['AVAILABLE', 'RENTED', 'SOLD', 'PENDING', 'INACTIVE'].includes(body.status)) {
    throw badRequest('Invalid listing status.');
  }
  if (body.is_public !== undefined && typeof body.is_public !== 'boolean') throw badRequest('Trạng thái công khai không hợp lệ.');
  const ranges = { price: [0, 1e15], area: [0, 1e9], bedrooms: [0, 1000], bathrooms: [0, 1000],
    latitude: [-90, 90], longitude: [-180, 180] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = body[key];
    if (value === undefined || value === null || value === '') continue;
    if (!['string', 'number'].includes(typeof value) || !Number.isFinite(Number(value))
      || Number(value) < min || Number(value) > max
      || (['bedrooms', 'bathrooms'].includes(key) && !Number.isInteger(Number(value)))) {
      throw badRequest(`Invalid ${key}.`);
    }
  }
  for (const key of ['features', 'lifestyle_tags']) {
    if (body[key] === undefined) continue;
    if (!Array.isArray(body[key]) || body[key].length > 50) throw badRequest(`Invalid ${key}.`);
    body[key].forEach((value) => text(value, key, 120, { required: true }));
  }
  if (body.virtual_tour_url !== undefined && body.virtual_tour_url !== null && body.virtual_tour_url !== '') {
    text(body.virtual_tour_url, 'virtual_tour_url', 2000);
    try {
      if (!['http:', 'https:'].includes(new URL(body.virtual_tour_url).protocol)) throw new Error();
    } catch { throw badRequest('Invalid virtual_tour_url.'); }
  }
  return body;
};

module.exports = { badRequest, positiveId, boundedInteger, text, propertyInput };
