import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { finishAuthentication } from './pendingAuthFlow';

export const useFinishAuthentication = () => {
  const navigate = useNavigate();
  const { completeLogin, refreshOnboardingStatus } = useAuth();
  return useCallback((data) => finishAuthentication({
    data,
    completeLogin,
    refreshOnboardingStatus,
    navigate
  }), [completeLogin, navigate, refreshOnboardingStatus]);
};
