// Từ khóa địa điểm dạng chữ: chữ thường, bỏ dấu, ký tự khác chữ/số thành khoảng trắng (khớp listing_search_norm ở SQL).
const asciiFold = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const CITY_ALIASES = new Map([
  ['hcm', 'ho chi minh'],
  ['tphcm', 'ho chi minh'],
  ['tp hcm', 'ho chi minh'],
  ['sg', 'ho chi minh'],
  ['hn', 'ha noi'],
  ['tphn', 'ha noi'],
  ['dn', 'da nang']
]);

const ADMIN_PREFIX = /^(thanh pho|tp|tinh|thi xa|thi tran|dac khu|quan|q|huyen|phuong|p|xa)\s+(.+)$/;
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

module.exports = { asciiFold, normalizeLocation };

