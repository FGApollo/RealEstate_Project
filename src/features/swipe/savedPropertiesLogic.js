import { getCategoryKey } from '../../services/propertyCategory.js';

export const SAVED_CATEGORIES = [
  'Tất cả',
  'Phòng Trọ',
  'Căn Hộ',
  'Chung Cư',
  'Nhà Ở',
  'Văn Phòng',
  'Mặt Bằng'
];

export const SAVED_SORT_OPTIONS = [
  { value: 'recent', label: 'Thêm gần đây' },
  { value: 'price-desc', label: 'Giá: Cao đến Thấp' },
  { value: 'price-asc', label: 'Giá: Thấp đến Cao' }
];

export const countByCategory = (favorites = [], category = 'Tất cả') => {
  if (category === 'Tất cả') return favorites.length;
  return favorites.filter((item) => getCategoryKey(item.property_type) === category).length;
};

export const filterAndSortSaved = (favorites = [], { category = 'Tất cả', sortBy = 'recent' } = {}) => {
  const list = category === 'Tất cả'
    ? [...favorites]
    : favorites.filter((item) => getCategoryKey(item.property_type) === category);

  if (sortBy === 'price-desc') {
    list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
  } else if (sortBy === 'price-asc') {
    list.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
  }
  return list;
};

// Format Vietnamese price cleanly like "3,5 triệu", "7,2 triệu", "10 triệu", "2,4 tỷ".
export const formatSavedPrice = (price) => {
  const num = Number(price);
  if (!Number.isFinite(num) || num <= 0) return 'Liên hệ';
  if (num >= 1_000_000_000) {
    const val = (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${val} tỷ`;
  }
  if (num >= 1_000_000) {
    const val = (num / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',');
    return `${val} triệu`;
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
};

export const formatSavedSpecs = (property = {}) => {
  const parts = [];
  if (property.bedrooms !== null && property.bedrooms !== undefined && Number(property.bedrooms) >= 0) {
    parts.push(`${property.bedrooms} PN`);
  }
  if (property.bathrooms !== null && property.bathrooms !== undefined && Number(property.bathrooms) >= 0) {
    parts.push(`${property.bathrooms} WC`);
  }
  if (Number(property.area) > 0) {
    parts.push(`${property.area} m²`);
  }
  return parts;
};
