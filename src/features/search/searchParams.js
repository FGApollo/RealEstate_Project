// Tham số tìm kiếm nằm trên URL (/search?q=...&type=...): Back / F5 / chia sẻ link đều giữ nguyên kết quả.
export const PRICE_RANGES = [
  { value: 'ALL', label: 'Tất cả mức giá', min: '', max: '' },
  { value: 'under-5m', label: 'Dưới 5 triệu', min: '0', max: '5000000' },
  { value: '5m-10m', label: '5 - 10 triệu', min: '5000000', max: '10000000' },
  { value: '10m-20m', label: '10 - 20 triệu', min: '10000000', max: '20000000' },
  { value: 'over-20m', label: 'Trên 20 triệu', min: '20000000', max: '' }
];

export const PROPERTY_TYPE_OPTIONS = ['Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Phòng Trọ', 'Mặt Bằng', 'Văn Phòng'];

const list = (params, key) => params.getAll(key).map((value) => value.trim()).filter(Boolean).slice(0, 20);

export const readSearch = (params) => ({
  // Khu vực theo đơn vị hành chính mới (dropdown). q: từ khóa chữ cũ, vẫn nhận để link cũ không hỏng.
  province: (params.get('province') || '').slice(0, 120),
  ward: params.get('province') ? (params.get('ward') || '').slice(0, 120) : '',
  q: (params.get('q') || '').slice(0, 120),
  types: list(params, 'type'),
  listing: ['RENT', 'SALE'].includes(params.get('listing')) ? params.get('listing') : '',
  minPrice: params.get('minPrice') || '',
  maxPrice: params.get('maxPrice') || '',
  minArea: params.get('minArea') || '',
  maxArea: params.get('maxArea') || '',
  beds: list(params, 'beds'),
  tags: list(params, 'tag'),
  // Danh sách phường chọn ở bộ lọc nâng cao trang chủ (khớp đúng tên phường), khác với ward ở trên.
  wards: list(params, 'wardName')
});

export const writeSearch = (search) => {
  const params = new URLSearchParams();
  if (search.province) params.set('province', search.province);
  if (search.province && search.ward) params.set('ward', search.ward);
  if (search.q?.trim()) params.set('q', search.q.trim());
  (search.types || []).forEach((value) => params.append('type', value));
  if (search.listing) params.set('listing', search.listing);
  ['minPrice', 'maxPrice', 'minArea', 'maxArea'].forEach((key) => {
    if (search[key] !== '' && search[key] != null) params.set(key, String(search[key]));
  });
  (search.beds || []).forEach((value) => params.append('beds', String(value)));
  (search.tags || []).forEach((value) => params.append('tag', value));
  (search.wards || []).forEach((value) => params.append('wardName', value));
  return params.toString();
};

// Bộ lọc gửi lên API danh sách công khai (server chuẩn hóa từ khóa địa điểm).
export const toApiFilters = (search) => JSON.stringify({
  ...(search.province ? { province: search.province } : {}),
  ...(search.province && search.ward ? { ward: search.ward } : {}),
  ...(search.q?.trim() ? { location: search.q.trim() } : {}),
  categories: search.types,
  ...(search.listing ? { listingType: search.listing } : {}),
  minPrice: search.minPrice, maxPrice: search.maxPrice, minArea: search.minArea, maxArea: search.maxArea,
  bedrooms: search.beds.map(String), features: search.tags, wards: search.wards
});

export const priceRangeOf = (search) => PRICE_RANGES.find((range) => range.min === search.minPrice && range.max === search.maxPrice)?.value
  || (search.minPrice || search.maxPrice ? 'CUSTOM' : 'ALL');

export const formatPrice = (price) => {
  const value = Number(price);
  if (!value) return 'Liên hệ';
  if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace('.0', '')} Tỷ`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(0)} Triệu`;
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};
