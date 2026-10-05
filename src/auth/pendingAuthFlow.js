import { API_BASE_URL } from '../config';
import { apiFetch } from './apiClient';
import { roleDestination } from './roleDestination';
import { clearPendingAuthAction, readPendingAuthAction } from './pendingAuthAction';

export const resumePendingAuthAction = async (navigate, fallback = '/swipe/T%E1%BA%A5t%20c%E1%BA%A3') => {
  const pending = readPendingAuthAction();
  if (!pending) {
    navigate(fallback, { replace: true });
    return;
  }

  clearPendingAuthAction();
  if (pending.type === 'FAVORITE_PROPERTY') {
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: Number(pending.propertyId) })
      });
      const state = {
        ...(pending.routeState || {}),
        authActionNotice: response.ok ? 'Đã lưu bất động sản vào mục yêu thích.' : 'Không thể lưu bất động sản lúc này.'
      };
      navigate(pending.returnTo, { replace: true, state });
    } catch {
      navigate(pending.returnTo, {
        replace: true,
        state: { ...(pending.routeState || {}), authActionNotice: 'Không thể lưu bất động sản lúc này.' }
      });
    }
    return;
  }

  if (pending.type === 'OPEN_CHAT_BY_PROPERTY') {
    navigate(`/chat?propertyId=${encodeURIComponent(pending.propertyId)}`, { replace: true });
    return;
  }

  navigate(pending.returnTo, { replace: true, state: pending.routeState });
};

export const finishAuthentication = async ({ data, completeLogin, refreshOnboardingStatus, navigate }) => {
  completeLogin(data);
  const role = String(data?.user?.role || '').toUpperCase();
  if (role === 'USER') {
    const onboardingStatus = await refreshOnboardingStatus(data.user);
    if (onboardingStatus === 'required') {
      navigate('/onboarding', { replace: true });
      return;
    }
  }

  const fallback = roleDestination(role);
  if (!readPendingAuthAction()) {
    navigate(fallback, { replace: true });
    return;
  }
  await resumePendingAuthAction(navigate, fallback);
};
