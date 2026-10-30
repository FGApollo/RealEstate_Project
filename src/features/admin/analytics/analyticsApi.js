import { API_BASE_URL } from '../../../config';
import { apiFetch } from '../../../auth/apiClient';

export async function fetchAnalytics(query, signal) {
  const response = await apiFetch(`${API_BASE_URL}/api/admin/analytics/overview?${query}`, { signal });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Không thể tải thống kê. Vui lòng thử lại.');
  return result;
}
