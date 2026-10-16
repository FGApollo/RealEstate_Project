export const number = (value) => value == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
export const money = (value) => value == null ? '—' : `${number(value)} ₫`;
export const percent = (value) => `${number(value)}%`;
