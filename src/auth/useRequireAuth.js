import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { savePendingAuthAction } from './pendingAuthAction';

export const useRequireAuth = () => {
  const navigate = useNavigate();
  const { waitForAuth, waitForOnboardingStatus } = useAuth();

  return useCallback(async (pendingAction) => {
    const authState = await waitForAuth();
    if (authState.authStatus !== 'authenticated' || !authState.user) {
      savePendingAuthAction(pendingAction);
      navigate('/login');
      return null;
    }

    if (String(authState.user.role).toUpperCase() === 'USER') {
      const onboardingStatus = authState.onboardingStatus === 'checking'
        ? await waitForOnboardingStatus()
        : authState.onboardingStatus;
      if (onboardingStatus === 'required') {
        savePendingAuthAction(pendingAction);
        navigate('/onboarding', { replace: true });
        return null;
      }
    }

    return authState.user;
  }, [navigate, waitForAuth, waitForOnboardingStatus]);
};
