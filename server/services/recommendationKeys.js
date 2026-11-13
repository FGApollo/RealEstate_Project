const { resolveNewArea } = require('./adminAreas');

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
  const [city, area] = String(key || '').split('|');
  const cityKey = canonicalPlace(city);
  const areaKey = canonicalPlace(area);
  return cityKey && areaKey ? `${cityKey}|${areaKey}` : '';
};

// Đơn vị hành chính mới (2025: Tỉnh/TP -> Phường/Xã).
// Khi tin có phường/xã, quy về đơn vị mới qua resolveNewArea để ghép đúng cả tin cũ lẫn tin mới;
// nếu chỉ có { city, district } (không có ward), giữ tương thích ngược với khóa theo quận/huyện.
const resolveLocationParts = (property = {}) => {
  const rawCity = String(property?.city || '').trim();
  const rawDistrict = String(property?.district || '').trim();
  const rawWard = String(property?.ward || '').trim();
  if (!rawCity) return null;

  if (rawWard) {
    const resolved = resolveNewArea({ city: rawCity, district: rawDistrict, ward: rawWard });
    if (resolved.ward) return { area: resolved.ward, province: resolved.province || rawCity };
    return { area: rawDistrict || rawWard, province: rawCity };
  }

  return rawDistrict ? { area: rawDistrict, province: rawCity } : null;
};

const locationKey = (property = {}) => {
  const parts = resolveLocationParts(property);
  if (!parts) return '';
  const cityKey = canonicalPlace(parts.province);
  const areaKey = canonicalPlace(parts.area);
  return cityKey && areaKey ? `${cityKey}|${areaKey}` : '';
};

const locationLabel = (property = {}) => {
  const parts = resolveLocationParts(property);
  return parts ? `${parts.area}, ${parts.province}` : '';
};

const propertyFeatureKeys = (property) => [
  ...(property?.property_features || []).map((feature) => typeof feature === 'string' ? feature : feature?.feature_name),
  ...(property?.lifestyle_tags || []).map((tag) => typeof tag === 'string' ? tag : tag?.tag_name)
].map(normalizeKey).filter(Boolean);

module.exports = {
  PROPERTY_TYPES,
  normalizeKey,
  propertyTypeKey,
  locationKey,
  locationLabel,
  canonicalLocationKey,
  propertyFeatureKeys
};
