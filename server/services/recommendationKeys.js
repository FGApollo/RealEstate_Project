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

const locationKey = ({ city, district } = {}) => {
  const cityKey = normalizeKey(city);
  const districtKey = normalizeKey(district);
  return cityKey && districtKey ? `${cityKey}|${districtKey}` : '';
};

const propertyFeatureKeys = (property) => [
  ...(property?.property_features || []).map((feature) => typeof feature === 'string' ? feature : feature?.feature_name),
  ...(property?.lifestyle_tags || []).map((tag) => typeof tag === 'string' ? tag : tag?.tag_name)
].map(normalizeKey).filter(Boolean);

module.exports = { PROPERTY_TYPES, normalizeKey, propertyTypeKey, locationKey, propertyFeatureKeys };
