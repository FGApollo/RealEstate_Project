const imageSources = require('./discoveryImages.json');

const SEED_ID = 'SN-HCM-20261008';
const OWNER_EMAIL = 'swipenest.discovery.seed@estate.test';
const CATEGORIES = ['Phòng Trọ', 'Căn Hộ', 'Chung Cư', 'Nhà Ở', 'Văn Phòng', 'Mặt Bằng'];

// Use the wards already supported by the app. Districts are familiar area labels.
const LOCATIONS = [
  { ward: 'Phường Thạnh Mỹ Tây', district: 'Bình Thạnh', areaName: 'Bình Thạnh' },
  { ward: 'Phường An Khánh', district: 'TP. Thủ Đức', areaName: 'An Khánh' },
  { ward: 'Phường Phú Nhuận', district: 'Phú Nhuận', areaName: 'Phú Nhuận' },
  { ward: 'Phường Tân Bình', district: 'Tân Bình', areaName: 'Tân Bình' },
  { ward: 'Phường Gò Vấp', district: 'Gò Vấp', areaName: 'Gò Vấp' },
  { ward: 'Phường Xuân Hòa', district: 'Quận 3', areaName: 'Xuân Hòa' },
  { ward: 'Phường Tân Hưng', district: 'Quận 7', areaName: 'Tân Hưng' },
  { ward: 'Phường Bến Thành', district: 'Quận 1', areaName: 'Bến Thành' },
  { ward: 'Phường Hiệp Bình', district: 'TP. Thủ Đức', areaName: 'Hiệp Bình' },
  { ward: 'Phường Chánh Hưng', district: 'Quận 8', areaName: 'Chánh Hưng' }
];

const CATEGORY_DETAILS = {
  'Phòng Trọ': {
    key: 'PHONG_TRO', name: 'Phòng trọ',
    prices: [2800000, 3200000, 3500000, 3000000, 2500000, 4200000, 3800000, 4800000, 2900000, 3300000],
    areas: [20, 24, 25, 22, 18, 28, 26, 30, 21, 23],
    bedrooms: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    variants: ['có gác và bếp riêng', 'cửa sổ thoáng', 'có máy lạnh', 'gác rộng', 'giờ giấc tự do', 'có ban công', 'nội thất cơ bản', 'đầy đủ tiện nghi', 'không chung chủ', 'nhà vệ sinh riêng'],
    features: ['Có gác', 'Bếp riêng', 'Nhà vệ sinh riêng', 'Giờ giấc tự do', 'Wi-Fi'],
    tags: ['Phù hợp sinh viên', 'Phù hợp người đi làm', 'Gần trạm xe buýt']
  },
  'Căn Hộ': {
    key: 'CAN_HO', name: 'Căn hộ dịch vụ',
    prices: [6500000, 7200000, 8000000, 6800000, 5500000, 8500000, 9000000, 12000000, 7500000, 6000000],
    areas: [35, 40, 45, 38, 30, 50, 55, 65, 42, 32],
    bedrooms: [1, 1, 1, 1, 1, 2, 2, 2, 1, 1],
    variants: ['bếp riêng', 'nhiều ánh sáng', 'nội thất đầy đủ', 'có cửa sổ', 'studio gọn gàng', 'có ban công', 'phòng khách riêng', 'không gian rộng', 'có máy giặt', 'phù hợp ở một mình'],
    features: ['Bếp riêng', 'Máy lạnh', 'Tủ lạnh', 'Thang máy', 'Nội thất đầy đủ'],
    tags: ['Phù hợp người đi làm', 'Môi trường yên tĩnh', 'Gần siêu thị']
  },
  'Chung Cư': {
    key: 'CHUNG_CU', name: 'Chung cư',
    prices: [11000000, 13000000, 12000000, 10000000, 8500000, 14000000, 15000000, 19000000, 9500000, 9000000],
    areas: [55, 68, 62, 58, 50, 75, 80, 95, 56, 54],
    bedrooms: [2, 2, 2, 2, 1, 2, 3, 3, 2, 2],
    variants: ['ban công thoáng', 'khuôn viên xanh', 'bảo vệ 24/7', 'gần tiện ích', 'thiết kế gọn', 'nội thất đầy đủ', 'phù hợp gia đình', 'không gian rộng', 'kết nối thuận tiện', 'khu dân cư yên tĩnh'],
    features: ['Thang máy', 'Bảo vệ 24/7', 'Ban công', 'Bãi đỗ xe', 'Khu sinh hoạt chung'],
    tags: ['Phù hợp gia đình', 'Gần siêu thị', 'Môi trường yên tĩnh']
  },
  'Nhà Ở': {
    key: 'NHA_O', name: 'Nhà nguyên căn',
    prices: [18000000, 22000000, 20000000, 15000000, 12000000, 25000000, 23000000, 30000000, 16000000, 14000000],
    areas: [75, 100, 90, 65, 60, 110, 105, 130, 80, 70],
    bedrooms: [3, 4, 3, 2, 2, 4, 4, 5, 3, 3],
    variants: ['có sân để xe', 'ban công rộng', 'hẻm yên tĩnh', 'bếp riêng', 'phù hợp gia đình', 'phòng khách rộng', 'nhiều ánh sáng', 'có sân thượng', 'không chung chủ', 'nội thất cơ bản'],
    features: ['Bếp riêng', 'Sân để xe', 'Ban công', 'Không chung chủ', 'Giờ giấc tự do'],
    tags: ['Phù hợp gia đình', 'Môi trường yên tĩnh', 'Gần chợ']
  },
  'Văn Phòng': {
    key: 'VAN_PHONG', name: 'Văn phòng',
    prices: [12000000, 15000000, 13000000, 10000000, 8000000, 18000000, 16000000, 25000000, 11000000, 9000000],
    areas: [40, 55, 45, 35, 30, 65, 60, 85, 38, 32],
    bedrooms: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    variants: ['cho nhóm nhỏ', 'ánh sáng tự nhiên', 'nội thất sẵn có', 'làm việc linh hoạt', 'cho startup', 'không gian mở', 'có khu tiếp khách', 'cho đội ngũ lớn', 'thuận tiện di chuyển', 'yên tĩnh'],
    features: ['Máy lạnh', 'Internet tốc độ cao', 'Bàn ghế làm việc', 'Thang máy', 'Bãi đỗ xe'],
    tags: ['Phù hợp doanh nghiệp nhỏ', 'Môi trường làm việc chuyên nghiệp', 'Gần trạm xe buýt']
  },
  'Mặt Bằng': {
    key: 'MAT_BANG', name: 'Mặt bằng kinh doanh',
    prices: [14000000, 18000000, 16000000, 12000000, 9000000, 20000000, 22000000, 35000000, 11000000, 10000000],
    areas: [45, 60, 55, 40, 35, 70, 80, 100, 42, 38],
    bedrooms: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    variants: ['cho cửa hàng nhỏ', 'không gian mở', 'có khu trưng bày', 'cho dịch vụ cá nhân', 'diện tích gọn', 'dễ bố trí nội thất', 'cho showroom', 'diện tích rộng', 'có bếp phụ', 'có nhà vệ sinh riêng'],
    features: ['Tầng trệt', 'Nhà vệ sinh riêng', 'Lối đi riêng', 'Không gian mở', 'Chỗ để xe'],
    tags: ['Phù hợp kinh doanh', 'Gần khu dân cư', 'Gần chợ']
  }
};

const CORRECTIONS = [
  { id: 70, before: { title: 'Chung cư làng đại học ', property_type: 'Phòng Trọ' }, after: { title: 'Phòng trọ làng đại học' } },
  { id: 65, before: { title: 'chung cư metro tower', property_type: 'Căn Hộ' }, after: { title: 'Chung cư Metro Tower', property_type: 'Chung Cư' } },
  { id: 66, before: { title: 'chung cư kim oanh', property_type: 'Căn Hộ' }, after: { title: 'Chung cư Kim Oanh', property_type: 'Chung Cư' } },
  { id: 61, before: { title: 'căn hộ của conculenmen', property_type: 'Nhà Ở' }, after: { title: 'Nhà ở của conculenmen' } }
];

const illustrationNote = (image) => `Ảnh minh họa bất động sản tại ${image.location}, không phải ảnh xác thực của tin đăng. Nguồn ảnh: ${image.source}`;

const buildFixtures = () => CATEGORIES.flatMap((category) => {
  const details = CATEGORY_DETAILS[category];
  return LOCATIONS.map((location, index) => {
    const imageIndex = index % imageSources[category].length;
    return {
      key: `${SEED_ID}-${details.key}-${String(index + 1).padStart(2, '0')}`,
      category,
      imageIndex,
      features: details.features.slice(0, 3 + index % 3),
      tags: details.tags.slice(0, 2 + index % 2),
      property: {
        title: `[Mẫu] ${details.name} ${details.variants[index]} tại ${location.areaName}`,
        description: `Tin mẫu để trải nghiệm tìm kiếm và bộ lọc, không phải tin cho thuê thực tế. ${details.name} ${details.areas[index]}m², ${details.variants[index]}, ${details.bedrooms[index] ? details.bedrooms[index] + ' phòng ngủ' : 'mặt sàn làm việc/kinh doanh'}, có nhà vệ sinh. Giá thuê mẫu ${(details.prices[index] / 1000000).toLocaleString('vi-VN')} triệu đồng/tháng.`,
        property_type: category,
        listing_type: 'RENT',
        status: 'AVAILABLE',
        is_hidden: false,
        price: details.prices[index],
        area: details.areas[index],
        bedrooms: details.bedrooms[index],
        bathrooms: category === 'Nhà Ở' ? Math.min(3, details.bedrooms[index]) : category === 'Chung Cư' && details.bedrooms[index] >= 2 ? 2 : 1,
        city: 'TP. Hồ Chí Minh',
        district: location.district,
        ward: location.ward,
        address: `${location.ward}, ${location.district}, TP. Hồ Chí Minh`,
        address_detail: `Dữ liệu mẫu: ${SEED_ID}-${details.key}-${String(index + 1).padStart(2, '0')}`,
        floor_range: category === 'Chung Cư' ? ['Thấp', 'Trung', 'Cao'][index % 3] : category === 'Căn Hộ' ? 'Thấp' : null,
        contact_phone: null,
        latitude: null,
        longitude: null,
        views: 0
      }
    };
  });
});

module.exports = { SEED_ID, OWNER_EMAIL, CATEGORIES, imageSources, CORRECTIONS, illustrationNote, buildFixtures };
