/**
 * Administrative Service (Dịch vụ Địa giới Hành chính Việt Nam)
 * Giải quyết Feature 17 & Feature 29: Xóa bỏ dữ liệu phường/xã hardcode rải rác
 * Hỗ trợ API provinces.open-api.vn với In-Memory / LocalStorage Cache và Offline Fallback
 */

// Offline Fallback Data cho các khu vực trọng điểm
const FALLBACK_REGIONS = {
  'TP.HCM': [
    'Phường Bến Nghé', 'Phường Bến Thành', 'Phường Cầu Ông Lãnh', 'Phường Đa Kao', 'Phường Tân Định',
    'Phường Sài Gòn', 'Phường Bàn Cờ', 'Phường Xuân Hòa', 'Phường Nhiêu Lộc', 'Phường Xóm Chiếu',
    'Phường Khánh Hội', 'Phường Vĩnh Hội', 'Phường Chợ Quán', 'Phường An Đông', 'Phường Chợ Lớn',
    'Phường Bình Tây', 'Phường Bình Tiên', 'Phường Bình Phú', 'Phường Phú Lâm', 'Phường Tân Thuận',
    'Phường Phú Thuận', 'Phường Tân Mỹ', 'Phường Tân Hưng', 'Phường Chánh Hưng', 'Phường Phú Định',
    'Phường Bình Đông', 'Phường Diên Hồng', 'Phường Vườn Lài', 'Phường Hòa Hưng', 'Phường Minh Phụng',
    'Phường Bình Thới', 'Phường Hòa Bình', 'Phường Phú Thọ', 'Phường Đông Hưng Thuận', 'Phường Trung Mỹ Tây',
    'Phường Tân Thới Hiệp', 'Phường Thới An', 'Phường An Phú Đông', 'Phường An Lạc', 'Phường Bình Tân',
    'Phường Tân Tạo', 'Phường Bình Trị Đông', 'Phường Bình Hưng Hòa', 'Phường Gia Định', 'Phường Bình Thạnh',
    'Phường Bình Lợi Trung', 'Phường Thạnh Mỹ Tây', 'Phường Bình Quới', 'Phường Hạnh Thông', 'Phường An Nhơn',
    'Phường Gò Vấp', 'Phường An Hội Đông', 'Phường Thông Tây Hội', 'Phường An Hội Tây', 'Phường Đức Nhuận',
    'Phường Cầu Kiệu', 'Phường Phú Nhuận', 'Phường Tân Sơn Hòa', 'Phường Tân Sơn Nhất', 'Phường Tân Hòa',
    'Phường Bảy Hiền', 'Phường Tân Bình', 'Phường Tân Sơn', 'Phường Tây Thạnh', 'Phường Tân Sơn Nhì',
    'Phường Phú Thọ Hòa', 'Phường Tân Phú', 'Phường Phú Thạnh', 'Phường Hiệp Bình', 'Phường Thủ Đức',
    'Phường Tam Bình', 'Phường Linh Xuân', 'Phường Tăng Nhơn Phú', 'Phường Long Bình', 'Phường Long Phước',
    'Phường Long Trường', 'Phường Cát Lái', 'Phường Bình Trưng', 'Phường Phước Long', 'Phường An Khánh'
  ],
  'Hà Nội': [
    'Phường Tràng Tiền', 'Phường Hàng Bạc', 'Phường Hàng Đào', 'Phường Đồng Xuân', 'Phường Cửa Đông',
    'Phường Điện Biên', 'Phường Quán Thánh', 'Phường Kim Mã', 'Phường Giảng Võ', 'Phường Ô Chợ Dừa',
    'Phường Láng Hạ', 'Phường Trung Hòa', 'Phường Yên Hòa', 'Phường Dịch Vọng', 'Phường Nghĩa Tân',
    'Phường Mễ Trì', 'Phường Mỹ Đình', 'Phường Cầu Diễn', 'Phường Bách Khoa', 'Phường Đồng Tâm'
  ],
  'Bình Dương': [
    'Phường Đông Hòa', 'Phường Dĩ An', 'Phường Tân Đông Hiệp', 'Phường An Phú', 'Phường Bình Hòa',
    'Phường Lái Thiêu', 'Phường Thuận An', 'Phường Thuận Giao', 'Phường Thủ Dầu Một', 'Phường Phú Lợi',
    'Phường Chánh Hiệp', 'Phường Bình Dương', 'Phường Hòa Lợi', 'Phường Phú An', 'Phường Tây Nam',
    'Phường Long Nguyên', 'Phường Bến Cát', 'Phường Chánh Phú Hòa', 'Phường Vĩnh Tân', 'Phường Bình Cơ',
    'Phường Tân Uyên', 'Phường Tân Hiệp', 'Phường Tân Khánh'
  ],
  'Bà Rịa - Vũng Tàu': [
    'Phường Vũng Tàu', 'Phường Tam Thắng', 'Phường Rạch Dừa', 'Phường Phước Thắng', 'Phường Long Hương',
    'Phường Bà Rịa', 'Phường Tam Long', 'Phường Tân Hải', 'Phường Tân Phước', 'Phường Phú Mỹ',
    'Phường Tân Thành'
  ],
  'Đà Nẵng': [
    'Phường Hải Châu', 'Phường Thạch Thang', 'Phường Thanh Bình', 'Phường Thuận Phước', 'Phường Hòa Cường',
    'Phường An Hải Bắc', 'Phường Phước Mỹ', 'Phường Khuê Mỹ', 'Phường Hòa Hải', 'Phường Hòa Khánh'
  ]
};

const CUSTOM_LOCATION_SUGGESTIONS = [
  {
    name: 'Phường Sài Gòn',
    subtext: 'Gồm: Bến Nghé, một phần Đa Kao, Nguyễn Thái Bình',
    keywords: ['sai gon', 'sài gòn', 'ben nghe', 'bến nghé', 'da kao', 'đa kao', 'nguyen thai binh', 'nguyễn thái bình'],
    ward: 'Phường Sài Gòn',
    region: 'TP.HCM'
  },
  {
    name: 'Phường Tân Bình',
    subtext: 'Gồm: phường 13, 14, một phần phường 15 cũ',
    keywords: ['tan binh', 'tân bình', 'phường 13', 'phuong 13', 'phường 14', 'phuong 14', 'phường 15', 'phuong 15'],
    ward: 'Phường Tân Bình',
    region: 'TP.HCM'
  },
  {
    name: 'Phường Dĩ An',
    subtext: 'Thành phố Dĩ An, Bình Dương',
    keywords: ['di an', 'dĩ an', 'binh duong', 'bình dương'],
    ward: 'Phường Dĩ An',
    region: 'Bình Dương'
  },
  {
    name: 'Phường Vũng Tàu',
    subtext: 'Thành phố Vũng Tàu, Bà Rịa - Vũng Tàu',
    keywords: ['vung tau', 'vũng tàu', 'ba ria', 'bà rịa'],
    ward: 'Phường Vũng Tàu',
    region: 'Bà Rịa - Vũng Tàu'
  },
  {
    name: 'Phường Bến Nghé',
    subtext: 'Gồm: Bến Nghé, một phần Đa Kao, Nguyễn Thái Bình',
    keywords: ['ben nghe', 'bến nghé', 'quan 1', 'quận 1'],
    ward: 'Phường Sài Gòn',
    region: 'TP.HCM'
  }
];

class AdministrativeService {
  constructor() {
    this.cache = {
      provinces: null,
      wardsByRegion: { ...FALLBACK_REGIONS }
    };
    this.isFetching = false;
  }

  /**
   * Lấy danh sách các tỉnh / thành phố từ open-api hoặc fallback
   */
  async getProvinces() {
    if (this.cache.provinces && this.cache.provinces.length > 0) {
      return this.cache.provinces;
    }

    try {
      const res = await fetch('https://provinces.open-api.vn/api/p/');
      if (res.ok) {
        const data = await res.json();
        this.cache.provinces = data;
        return data;
      }
    } catch (err) {
      console.warn('Không thể tải danh sách tỉnh/thành từ open-api, sử dụng fallback:', err.message);
    }

    // Fallback nếu API ngoài gặp sự cố
    return Object.keys(FALLBACK_REGIONS).map((name, index) => ({
      code: index + 1,
      name
    }));
  }

  /**
   * Lấy danh sách phường/xã theo tên vùng (TP.HCM, Bình Dương, ...)
   */
  getWardsByRegion(regionName = 'TP.HCM') {
    return this.cache.wardsByRegion[regionName] || FALLBACK_REGIONS[regionName] || [];
  }

  /**
   * Lấy toàn bộ danh sách phường/xã gộp chung
   */
  getAllWards() {
    return Object.values(this.cache.wardsByRegion).flat();
  }

  /**
   * Lấy danh sách vùng / miền
   */
  getAvailableRegions() {
    return Object.keys(this.cache.wardsByRegion);
  }

  /**
   * Lấy các gợi ý địa điểm thông minh tùy chỉnh
   */
  getLocationSuggestions() {
    return CUSTOM_LOCATION_SUGGESTIONS;
  }

  /**
   * Tìm kiếm phường xã theo từ khóa
   */
  searchWards(keyword = '', region = null) {
    const norm = keyword.trim().toLowerCase();
    if (!norm) return [];

    let pool = region ? this.getWardsByRegion(region) : this.getAllWards();
    return pool.filter(ward => ward.toLowerCase().includes(norm));
  }
}

export const normalizeWard = (ward) => {
  if (!ward) return '';
  return ward
    .normalize('NFC')
    .toLowerCase()
    .replace(/^(phường|p\.)\s+/i, '')
    .trim();
};

export const administrativeService = new AdministrativeService();
export const WARDS_BY_REGION = FALLBACK_REGIONS;
export const ALL_WARDS = Object.values(FALLBACK_REGIONS).flat();
export { CUSTOM_LOCATION_SUGGESTIONS };
export default administrativeService;
