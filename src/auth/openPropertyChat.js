import { API_BASE_URL } from '../config';
import { apiFetch } from './apiClient';

export const openPropertyChat = async ({ propertyId, requireAuth, navigate }) => {
  const id = Number(propertyId);
  const user = await requireAuth({ type: 'OPEN_CHAT_BY_PROPERTY', propertyId: id });
  if (!user) return false;

  const response = await apiFetch(`${API_BASE_URL}/api/properties/${id}/contact-agent`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Không thể mở cuộc trò chuyện lúc này.');

  navigate(`/chat?propertyId=${encodeURIComponent(id)}`);
  return true;
};
