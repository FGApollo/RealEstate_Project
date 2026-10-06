const PROPERTY_CATEGORY_NAMES = {
  CAN_HO: 'Căn Hộ',
  CHUNG_CU: 'Chung Cư',
  NHA_O: 'Nhà Ở',
  PHONG_TRO: 'Phòng Trọ',
  VAN_PHONG: 'Văn Phòng',
  MAT_BANG: 'Mặt Bằng',
  DAT_NEN: 'Đất Nền',
  BIET_THU: 'Biệt Thự',
  ALL: 'Tất cả'
};

export const propertyCategoryKey = (value) => {
  const key = String(value || '').trim().toLocaleLowerCase('vi')
    .replace(/đ/g, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (PROPERTY_CATEGORY_NAMES[key.toUpperCase()]) return key.toUpperCase();
  if (key === 'tat_ca' || key === 'all') return 'ALL';
  if (key.includes('chung_cu') || key.includes('condo')) return 'CHUNG_CU';
  if (key.includes('can_ho') || key.includes('apartment') || key.includes('studio')) return 'CAN_HO';
  if (key.includes('phong_tro') || key.includes('nha_tro') || key.includes('room')) return 'PHONG_TRO';
  if (key.includes('van_phong') || key.includes('office')) return 'VAN_PHONG';
  if (key.includes('mat_bang') || key.includes('retail') || key.includes('commercial')) return 'MAT_BANG';
  if (key.includes('dat_nen') || key === 'dat' || key.includes('land')) return 'DAT_NEN';
  if (key.includes('biet_thu') || key.includes('villa')) return 'BIET_THU';
  if (key.includes('nha') || key.includes('house') || key.includes('townhouse')) return 'NHA_O';
  return null;
};

export const propertyCategoryName = (value) => PROPERTY_CATEGORY_NAMES[propertyCategoryKey(value)];
export const getCategoryKey = (value) => propertyCategoryName(value) || 'Căn Hộ';
