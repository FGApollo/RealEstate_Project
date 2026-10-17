import { apiFetch } from '../../../auth/apiClient';
import { API_BASE_URL } from '../../../config';

export async function billingRequest(path, options = {}) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    ...options, ...(options.body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {})
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Không thể tải thông tin thanh toán. Vui lòng thử lại.');
  return data;
}
export const billingMoney = (value) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
export const billingDate = (value) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
export const paymentStatus = (status) => ({ CREATING: 'Đang tạo liên kết', PENDING: 'Chờ thanh toán', PAID: 'Đã thanh toán', CANCELLED: 'Đã hủy', EXPIRED: 'Đã hết hạn', FAILED: 'Không thành công' })[status] || 'Chưa xác định';
export function openCheckout(value) {
  const url = new URL(value);
  if (url.origin !== 'https://pay.payos.vn' || !/^\/web\/[a-f0-9]{32}$/i.test(url.pathname)
    || url.username || url.password || url.search || url.hash) throw new Error('Liên kết thanh toán không hợp lệ.');
  window.location.assign(url.href);
}
