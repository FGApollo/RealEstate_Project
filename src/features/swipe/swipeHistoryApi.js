import { API_BASE_URL } from '../../config';
import { apiFetch } from '../../auth/apiClient';

// Lịch sử vuốt lưu trên server: mỗi tin một dòng (lượt vuốt gần nhất), mới nhất trước.
export async function fetchSwipeHistory({ offset = 0, limit = 10, signal } = {}) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  const response = await apiFetch(`${API_BASE_URL}/api/me/swipe-history?${params}`, { signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Chưa thể tải lịch sử vuốt.');
  return data;
}

export const SWIPE_HISTORY_PREVIEW = 10;
