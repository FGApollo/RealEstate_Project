import { useEffect, useState } from 'react';

// Đơn vị hành chính MỚI (từ 1/7/2025): 34 tỉnh/thành phố -> phường/xã, không còn cấp quận/huyện.
// Dữ liệu lưu sẵn trong public/data (nguồn provinces.open-api.vn v2), tải một lần rồi dùng lại.
let cache = null;
let pending = null;

export const loadAdminAreas = () => {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetch('/data/vn-admin-2025.json')
      .then((response) => {
        if (!response.ok) throw new Error('Không tải được danh sách tỉnh/thành phố.');
        return response.json();
      })
      .then((data) => {
        cache = data.provinces.map((province) => ({
          code: province.c,
          name: province.n,
          wards: province.w.map(([code, name]) => ({ code, name }))
        }));
        return cache;
      })
      .catch((error) => { pending = null; throw error; });
  }
  return pending;
};

export const useAdminAreas = () => {
  const [state, setState] = useState(() => ({ provinces: cache || [], error: '' }));
  useEffect(() => {
    if (cache) return undefined;
    let active = true;
    loadAdminAreas().then(
      (provinces) => { if (active) setState({ provinces, error: '' }); },
      (error) => { if (active) setState({ provinces: [], error: error.message }); }
    );
    return () => { active = false; };
  }, []);
  return state;
};

// So tên tỉnh cũ / viết tắt ("TP. Hồ Chí Minh", "Hồ Chí Minh", "Bình Dương") với tên tỉnh mới.
const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd')
  .toLowerCase().replace(/^(thanh pho|tp\.?|tinh)\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
const MERGED_INTO = { 'binh duong': 'ho chi minh', 'ba ria vung tau': 'ho chi minh', 'quang nam': 'da nang' };

export const findProvince = (provinces, name) => {
  const key = fold(name);
  if (!key) return null;
  const target = MERGED_INTO[key] || key;
  return provinces.find((province) => fold(province.name) === target) || null;
};

export const findWard = (province, name) => {
  const key = fold(String(name || '').replace(/^(phường|xã|đặc khu|thị trấn)\s+/i, ''));
  if (!province || !key) return null;
  return province.wards.find((ward) => fold(ward.name.replace(/^(Phường|Xã|Đặc khu|Thị trấn)\s+/i, '')) === key) || null;
};

// So tên tỉnh / phường không phân biệt dấu, tiền tố ("Thành phố", "Phường"...) hay tỉnh đã sáp nhập.
const stripWardUnit = (value) => String(value || '').replace(/^(phường|xã|đặc khu|thị trấn)\s+/i, '');
export const sameProvince = (a, b) => {
  const left = fold(a); const right = fold(b);
  return Boolean(left && right) && (MERGED_INTO[left] || left) === (MERGED_INTO[right] || right);
};
export const sameWard = (a, b) => {
  const left = fold(stripWardUnit(a)); const right = fold(stripWardUnit(b));
  return Boolean(left) && left === right;
};

// Định dạng khu vực theo hệ thống hành chính mới 2025 (Phường/Xã, Tỉnh/TP; vẫn giữ district nếu là tin cũ chưa chuyển đổi).
export const formatPropertyArea = (property) => {
  if (!property) return '';
  if (property.admin_area?.ward || property.admin_area?.province) {
    return [property.admin_area.ward, property.admin_area.province].filter(Boolean).join(', ');
  }
  return [property.ward, property.district, property.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
};

export const formatPropertyAddressLine = (property, fallback = '') => {
  if (!property) return fallback;
  const parts = [property.address_detail, property.ward, property.district, property.city]
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : (property.address || formatPropertyArea(property) || fallback);
};
