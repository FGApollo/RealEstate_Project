// Pure filtering, sorting, and formatting logic for homepage search dropdowns.

export const SOUTH_PROVINCE_CODES = new Set([75, 79, 80, 82, 86, 91, 92, 96]);
export const CENTRAL_PROVINCE_CODES = new Set([38, 40, 42, 44, 46, 48, 51, 52, 56, 66, 68]);
export const MAJOR_CITY_ORDER = [79, 1, 48, 92, 31];

export const REGION_TABS = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'SOUTH', label: 'Miền Nam' },
  { key: 'CENTRAL', label: 'Miền Trung' },
  { key: 'NORTH', label: 'Miền Bắc' }
];

export const PROPERTY_TYPE_ITEMS = [
  { value: 'ALL', label: 'Tất cả loại', iconKey: 'all' },
  { value: 'Căn Hộ', label: 'Căn hộ', iconKey: 'building' },
  { value: 'Chung Cư', label: 'Chung cư', iconKey: 'building' },
  { value: 'Nhà Ở', label: 'Nhà ở', iconKey: 'home' },
  { value: 'Phòng Trọ', label: 'Phòng trọ', iconKey: 'room' },
  { value: 'Mặt Bằng', label: 'Mặt bằng', iconKey: 'shop' },
  { value: 'Văn Phòng', label: 'Văn phòng', iconKey: 'office' }
];

export const PRICE_PRESET_OPTIONS = [
  { value: 'ALL', label: 'Tất cả mức giá', min: '', max: '' },
  { value: 'under-5m', label: 'Dưới 5 triệu', min: '0', max: '5000000' },
  { value: '5m-10m', label: '5 - 10 triệu', min: '5000000', max: '10000000' },
  { value: '10m-20m', label: '10 - 20 triệu', min: '10000000', max: '20000000' },
  { value: 'over-20m', label: 'Trên 20 triệu', min: '20000000', max: '' }
];

export const normalizeSearchText = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .trim();

export const regionOfProvince = (code) => {
  const num = Number(code);
  if (SOUTH_PROVINCE_CODES.has(num)) return 'SOUTH';
  if (CENTRAL_PROVINCE_CODES.has(num)) return 'CENTRAL';
  return 'NORTH';
};

export const shortProvinceName = (name = '') =>
  String(name).replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();

export const filterAndSortProvinces = (provinces = [], { region = 'ALL', query = '' } = {}) => {
  const q = normalizeSearchText(query);
  return provinces
    .filter((item) => {
      if (region !== 'ALL' && regionOfProvince(item.code) !== region) return false;
      return !q || normalizeSearchText(item.name).includes(q);
    })
    .sort((a, b) => {
      if (region === 'ALL' && !q) {
        const ia = MAJOR_CITY_ORDER.indexOf(Number(a.code));
        const ib = MAJOR_CITY_ORDER.indexOf(Number(b.code));
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
      }
      return a.name.localeCompare(b.name, 'vi');
    });
};

export const filterWards = (wards = [], query = '') => {
  const q = normalizeSearchText(query);
  return q ? wards.filter((item) => normalizeSearchText(item.name).includes(q)) : wards;
};

export const vndToMillionInput = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  const num = Number(value);
  if (!Number.isFinite(num)) return '';
  return num === 0 ? '0' : String(Number((num / 1000000).toFixed(2)));
};

export const millionInputToVnd = (value) => {
  const trimmed = String(value ?? '').trim();
  if (trimmed === '') return '';
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) return '';
  return String(Math.round(num * 1000000));
};

export const matchPricePreset = (minMillion, maxMillion) => {
  const minVnd = millionInputToVnd(minMillion);
  const maxVnd = millionInputToVnd(maxMillion);
  const matched = PRICE_PRESET_OPTIONS.find((opt) => opt.min === minVnd && opt.max === maxVnd);
  return matched ? matched.value : 'CUSTOM';
};

export const formatPriceDropdownLabel = ({ priceRange, minPrice, maxPrice }) => {
  const matched = PRICE_PRESET_OPTIONS.find((opt) => opt.value === priceRange);
  if (matched) return matched.label;
  const minM = vndToMillionInput(minPrice);
  const maxM = vndToMillionInput(maxPrice);
  if (minM && maxM) return `${minM} - ${maxM} triệu`;
  if (minM) return `Từ ${minM} triệu`;
  if (maxM) return `Đến ${maxM} triệu`;
  return 'Tất cả mức giá';
};

export const formatPropertyTypeLabel = (selectedCategories = []) => {
  if (selectedCategories.length === 0) return 'Tất cả loại';
  if (selectedCategories.length === 1) {
    return PROPERTY_TYPE_ITEMS.find((o) => o.value === selectedCategories[0])?.label || selectedCategories[0];
  }
  return `${selectedCategories.length} loại hình`;
};

export const formatAreaDropdownLabel = ({ province, ward, hasProvinces, error }) => {
  if (ward) return `${ward}, ${shortProvinceName(province)}`;
  if (province) return province;
  return hasProvinces ? 'Tất cả tỉnh/thành phố' : (error || 'Đang tải…');
};
