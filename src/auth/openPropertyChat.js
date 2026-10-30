import { API_BASE_URL } from '../config';
import { apiFetch } from './apiClient';

export const openPropertyChat = async ({ propertyId, requireAuth, navigate }) => {
  const id = Number(propertyId);
  const user = await requireAuth({ type: 'OPEN_CHAT_BY_PROPERTY', propertyId: id });
  if (!user) return false;

  const response = await apiFetch(`${API_BASE_URL}/api/properties/${id}/contact-agent`);
  const data = await response.json().catch(() => ({}));
  const agentQuery = data.agentId ? `&agentId=${encodeURIComponent(data.agentId)}` : '';
  navigate(`/chat?propertyId=${encodeURIComponent(id)}${agentQuery}`);
  return true;
};
