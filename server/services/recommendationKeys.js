const PROPERTY_TYPES = [
  { key: 'CAN_HO', label: 'Căn hộ' },
  { key: 'CHUNG_CU', label: 'Chung cư' },
  { key: 'NHA_O', label: 'Nhà ở' },
  { key: 'PHONG_TRO', label: 'Phòng trọ' },
  { key: 'VAN_PHONG', label: 'Văn phòng' },
  { key: 'MAT_BANG', label: 'Mặt bằng' },
  { key: 'DAT_NEN', label: 'Đất nền' },
  { key: 'BIET_THU', label: 'Biệt thự' }
];

const normalizeKey = (value) => String(value || '')
  .trim()
  .toLocaleLowerCase('vi')
  .replace(/đ/g, 'd')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const propertyTypeKey = (value) => {
  const key = normalizeKey(value);
  if (key.includes('chung_cu') || key.includes('condo')) return 'CHUNG_CU';
  if (key.includes('can_ho') || key.includes('apartment') || key.includes('studio')) return 'CAN_HO';
  if (key.includes('phong_tro') || key.includes('nha_tro') || key.includes('room')) return 'PHONG_TRO';
  if (key.includes('van_phong') || key.includes('office')) return 'VAN_PHONG';
  if (key.includes('mat_bang') || key.includes('retail') || key.includes('commercial')) return 'MAT_BANG';
  if (key.includes('dat_nen') || key === 'dat' || key.includes('land')) return 'DAT_NEN';
  if (key.includes('biet_thu') || key.includes('villa')) return 'BIET_THU';
  if (key.includes('nha') || key.includes('house') || key.includes('townhouse')) return 'NHA_O';
  return key.toUpperCase();
};

// "TP. Hồ Chí Minh", "Thành phố Hồ Chí Minh" và "Hồ Chí Minh" là cùng một nơi: bỏ tiền tố hành chính.
// Giữ "quan_" vì nhiều quận chỉ có số (Quận 1, Quận 7).
const ADMIN_PREFIX = /^(thanh_pho|tp|tinh|thi_xa|huyen)_/;
const canonicalPlace = (value) => normalizeKey(value).replace(ADMIN_PREFIX, '');

// Chuẩn hóa cả khóa đã lưu từ trước (ví dụ "tp_ho_chi_minh|quan_1") để so khớp với khóa mới.
const canonicalLocationKey = (key) => {
  const [city, district] = String(key || '').split('|');
  const cityKey = canonicalPlace(city);
  const districtKey = canonicalPlace(district);
  return cityKey && districtKey ? `${cityKey}|${districtKey}` : '';
};

const locationKey = ({ city, district } = {}) => {
  const cityKey = canonicalPlace(city);
  const districtKey = canonicalPlace(district);
  return cityKey && districtKey ? `${cityKey}|${districtKey}` : '';
};

const propertyFeatureKeys = (property) => [
  ...(property?.property_features || []).map((feature) => typeof feature === 'string' ? feature : feature?.feature_name),
  ...(property?.lifestyle_tags || []).map((tag) => typeof tag === 'string' ? tag : tag?.tag_name)
].map(normalizeKey).filter(Boolean);

module.exports = { PROPERTY_TYPES, normalizeKey, propertyTypeKey, locationKey, canonicalLocationKey, propertyFeatureKeys };
