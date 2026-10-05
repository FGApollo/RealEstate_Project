import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';
import { apiFetch, clearAccessToken, restoreSession, setAccessToken } from './apiClient';
import { AuthContext } from './context';

const initialAuthState = {
  user: null,
  authStatus: 'authenticating',
  onboardingStatus: 'unknown'
};

const persistUser = (user) => {
  try {
    if (user) localStorage.setItem('user', JSON.stringify(user));
    else localStorage.removeItem('user');
  } catch {
    // Session state always comes from the backend; storage is only a UI cache.
  }
};

const getOnboardingStatus = async () => {
  const response = await apiFetch(`${API_BASE_URL}/api/me/preferences`);
  if (!response.ok) return 'unknown';
  const data = await response.json();
  return data.preferences?.onboarding_completed ? 'complete' : 'required';
};

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState(initialAuthState);
  const authStateRef = useRef(initialAuthState);
  const authGenerationRef = useRef(0);
  const authWaitersRef = useRef(new Set());
  const onboardingWaitersRef = useRef(new Set());
  const onboardingCheckRef = useRef(null);

  const updateAuthState = useCallback((changes) => {
    const next = { ...authStateRef.current, ...changes };
    authStateRef.current = next;
    setAuthState(next);

    if (next.authStatus !== 'authenticating') {
      authWaitersRef.current.forEach((resolve) => resolve(next));
      authWaitersRef.current.clear();
    }
    if (next.onboardingStatus !== 'checking') {
      onboardingWaitersRef.current.forEach((resolve) => resolve(next.onboardingStatus));
      onboardingWaitersRef.current.clear();
    }
  }, []);

  const waitForAuth = useCallback(() => {
    const current = authStateRef.current;
    if (current.authStatus !== 'authenticating') return Promise.resolve(current);
    return new Promise((resolve) => authWaitersRef.current.add(resolve));
  }, []);

  const waitForOnboardingStatus = useCallback(() => {
    const current = authStateRef.current.onboardingStatus;
    if (current !== 'checking') return Promise.resolve(current);
    return new Promise((resolve) => onboardingWaitersRef.current.add(resolve));
  }, []);

  const refreshOnboardingStatus = useCallback((targetUser = authStateRef.current.user) => {
    if (!targetUser || String(targetUser.role).toUpperCase() !== 'USER') {
      updateAuthState({ onboardingStatus: 'not_required' });
      return Promise.resolve('not_required');
    }

    const generation = authGenerationRef.current;
    if (onboardingCheckRef.current?.generation === generation) return onboardingCheckRef.current.promise;

    updateAuthState({ onboardingStatus: 'checking' });
    const promise = (async () => {
      let status;
      try {
        status = await getOnboardingStatus();
      } catch {
        status = 'unknown';
      }
      if (generation === authGenerationRef.current) updateAuthState({ onboardingStatus: status });
      return generation === authGenerationRef.current ? status : authStateRef.current.onboardingStatus;
    })().finally(() => {
      if (onboardingCheckRef.current?.generation === generation) onboardingCheckRef.current = null;
    });
    onboardingCheckRef.current = { generation, promise };
    return promise;
  }, [updateAuthState]);

  useEffect(() => {
    let active = true;
    const generation = authGenerationRef.current;
    restoreSession()
      .then((restoredUser) => {
        if (!active || generation !== authGenerationRef.current) return;
        persistUser(restoredUser);
        if (restoredUser) {
          const isRegularUser = String(restoredUser.role).toUpperCase() === 'USER';
          updateAuthState({
            user: restoredUser,
            authStatus: 'authenticated',
            onboardingStatus: isRegularUser ? 'checking' : 'not_required'
          });
          if (isRegularUser) void refreshOnboardingStatus(restoredUser);
        } else {
          updateAuthState({ user: null, authStatus: 'unauthenticated', onboardingStatus: 'unknown' });
        }
      })
      .catch(() => {
        if (!active || generation !== authGenerationRef.current) return;
        persistUser(null);
        updateAuthState({ user: null, authStatus: 'unauthenticated', onboardingStatus: 'unknown' });
      });

    const handleExpiry = () => {
      authGenerationRef.current += 1;
      onboardingCheckRef.current = null;
      clearAccessToken();
      persistUser(null);
      updateAuthState({ user: null, authStatus: 'unauthenticated', onboardingStatus: 'unknown' });
    };
    window.addEventListener('auth:expired', handleExpiry);
    return () => {
      active = false;
      window.removeEventListener('auth:expired', handleExpiry);
    };
  }, [refreshOnboardingStatus, updateAuthState]);

  const completeLogin = useCallback(({ user: nextUser, accessToken }) => {
    authGenerationRef.current += 1;
    onboardingCheckRef.current = null;
    setAccessToken(accessToken);
    persistUser(nextUser);
    updateAuthState({
      user: nextUser,
      authStatus: 'authenticated',
      onboardingStatus: String(nextUser?.role).toUpperCase() === 'USER' ? 'checking' : 'not_required'
    });
  }, [updateAuthState]);

  const updateUser = useCallback((changes) => {
    const previous = authStateRef.current.user;
    if (!previous) return;
    const nextUser = { ...previous, ...changes };
    persistUser(nextUser);
    updateAuthState({ user: nextUser });
  }, [updateAuthState]);

  const markOnboardingCompleted = useCallback(() => {
    updateAuthState({ onboardingStatus: 'complete' });
  }, [updateAuthState]);

  const logout = useCallback(async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    if (!response.ok) throw new Error('Không thể đăng xuất. Vui lòng thử lại.');

    authGenerationRef.current += 1;
    onboardingCheckRef.current = null;
    clearAccessToken();
    persistUser(null);
    updateAuthState({ user: null, authStatus: 'unauthenticated', onboardingStatus: 'unknown' });
  }, [updateAuthState]);

  return (
    <AuthContext.Provider value={{
      ...authState,
      loading: authState.authStatus === 'authenticating',
      completeLogin,
      updateUser,
      refreshOnboardingStatus,
      waitForAuth,
      waitForOnboardingStatus,
      markOnboardingCompleted,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};
