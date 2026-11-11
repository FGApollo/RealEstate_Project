import { billingRequest } from '../agent/pricing/billingApi';

// Gói Swipe Nest Plus của người dùng (backend: /api/plus, migration 026).
export const fetchPlusCatalog = (options) => billingRequest('/api/plus/catalog', options);
export const fetchPlusStatus = (options) => billingRequest('/api/plus/status', options);
export const fetchPlusPayments = (options) => billingRequest('/api/plus/payments?page=1&limit=10', options);
export const fetchPlusPayment = (orderId, options) => billingRequest(`/api/plus/payments/${encodeURIComponent(orderId)}`, options);
export const cancelPlusPayment = (orderId) => billingRequest(`/api/plus/payments/${encodeURIComponent(orderId)}/cancel`, { method: 'POST' });
export const fetchOfficialListings = (options) => billingRequest('/api/plus/official-listings', options);

export const createPlusPayment = (plan) => billingRequest('/api/plus/payments', {
  method: 'POST',
  body: { planCode: plan.code, planVersion: plan.version, requestId: crypto.randomUUID() }
});

export const PLUS_BENEFITS = [
  { title: 'Tiếp cận nguồn hàng Swipe Nest', text: 'Xem toàn bộ nguồn hàng do đội Swipe Nest đăng ở mục riêng trên trang chủ, nhắn tin và xem liên hệ trực tiếp.' },
  { title: 'Không tự gia hạn', text: 'Mỗi lần thanh toán là 1 tháng. Mua thêm thì cộng dồn sau ngày hết hạn hiện tại.' }
];
