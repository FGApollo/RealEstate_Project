// Lọc tin theo đơn vị hành chính MỚI (từ 1/7/2025: tỉnh/thành phố -> phường/xã) nhưng vẫn khớp tin cũ
// ghi theo tỉnh - quận/huyện - phường/xã trước sáp nhập, dựa trên bảng ánh xạ của provinces.open-api.vn
// (server/data/vn-admin-legacy.json, có cho TP.HCM, Đà Nẵng, Hà Nội — nơi đang có tin đăng).
const legacyData = require('../data/vn-admin-legacy.json');
const { normalizeLocation } = require('./propertySearchFilters');

const key = (value) => (value ? normalizeLocation(String(value)) : '');

// Chuẩn bị sẵn khóa so khớp cho từng tỉnh mới.
const PROVINCES = new Map(Object.entries(legacyData.provinces).map(([name, entry]) => {
  const wards = new Map(Object.entries(entry.wards).map(([ward, olds]) => [key(ward),
    olds.map(([oldWard, oldDistrict]) => ({ ward: key(oldWard), district: key(oldDistrict) }))]));
  // Mọi cặp (phường cũ, quận cũ) đã có trong bảng ánh xạ của tỉnh.
  const mappedPairs = new Set([...wards.values()].flat().map((old) => `${old.ward}|${old.district}`));
  return [key(name), { provinceKeys: new Set([key(name), ...entry.legacyProvinces.map(key)]), wards, mappedPairs }];
}));

const matchesProvince = (property, province) => {
  const provinceKey = key(province);
  const cityKey = key(property.city);
  if (!cityKey) return false;
  const known = PROVINCES.get(provinceKey);
  return known ? known.provinceKeys.has(cityKey) : cityKey === provinceKey;
};

const matchesWard = (property, province, ward) => {
  const wardKey = key(ward);
  const propertyWard = key(property.ward);
  if (propertyWard && propertyWard === wardKey) return true; // tin ghi theo tên phường mới
  const known = PROVINCES.get(key(province));
  const legacy = known?.wards.get(wardKey) || [];
  const propertyDistrict = key(property.district);
  // Tin cũ: phải khớp cả phường lẫn quận cũ (nhiều quận có "Phường 12").
  if (legacy.some((old) => old.ward === propertyWard && old.district && old.district === propertyDistrict)) return true;
  // Bảng ánh xạ nguồn còn thiếu một số phường bị chia tách (VD "Phường 14, quận Bình Thạnh"). Tin cũ không ánh xạ
  // được thì xếp vào phường mới trùng tên quận cũ ("Phường Bình Thạnh"), nhiều phường mới ở TP.HCM đặt theo tên quận.
  const unmapped = !known || !known.mappedPairs.has(`${propertyWard}|${propertyDistrict}`);
  return Boolean(unmapped && propertyDistrict && !/^\d|^quan \d/.test(propertyDistrict) && propertyDistrict === wardKey);
};

// Tên hiển thị gốc (đơn vị mới) theo khóa so khớp, để trả về đúng chữ như danh sách chọn ở giao diện.
const DISPLAY = new Map(Object.entries(legacyData.provinces).map(([name, entry]) => [key(name),
  { name, wardNames: new Map(Object.keys(entry.wards).map((ward) => [key(ward), ward])) }]));

// Quy một tin (kể cả tin cũ ghi theo tỉnh - quận - phường trước sáp nhập) về đơn vị hành chính mới.
// Cùng quy tắc với matchesWard ở trên. Tỉnh ngoài bảng ánh xạ thì giữ nguyên tên đang ghi trong tin.
const resolveNewArea = (property) => {
  const cityKey = key(property.city);
  const provinceKey = [...PROVINCES.keys()].find((name) => PROVINCES.get(name).provinceKeys.has(cityKey));
  if (!provinceKey) return { province: property.city || null, ward: property.ward || null };
  const known = PROVINCES.get(provinceKey);
  const { name: province, wardNames } = DISPLAY.get(provinceKey);
  const propertyWard = key(property.ward);
  const propertyDistrict = key(property.district);
  if (propertyWard && wardNames.has(propertyWard)) return { province, ward: wardNames.get(propertyWard) };
  for (const [wardKey, olds] of known.wards) {
    if (olds.some((old) => old.ward === propertyWard && old.district && old.district === propertyDistrict)) {
      return { province, ward: wardNames.get(wardKey) };
    }
  }
  if (propertyDistrict && !/^\d|^quan \d/.test(propertyDistrict) && wardNames.has(propertyDistrict)) {
    return { province, ward: wardNames.get(propertyDistrict) };
  }
  return { province, ward: null };
};

const matchesArea = (property, { province, ward } = {}) => {
  if (province && !matchesProvince(property, province)) return false;
  if (ward && !matchesWard(property, province, ward)) return false;
  return true;
};

module.exports = { matchesArea, matchesProvince, matchesWard, resolveNewArea };
