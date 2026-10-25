import { API_BASE_URL } from '../config';
import { getOnboardingSessionKey } from './onboardingSession.js';
import { createSessionClient, withSessionLock } from './sessionClient.js';

const client = createSessionClient({
  apiBaseUrl: API_BASE_URL,
  fetchImpl: (...args) => fetch(...args),
  withLock: withSessionLock,
  onExpired: () => window.dispatchEvent(new Event('auth:expired')),
  onUser: (user) => window.dispatchEvent(new CustomEvent('auth:refreshed', { detail: user }))
});

export const { apiFetch, publicApiFetch, restoreSession, setAccessToken, clearAccessToken, getAccessToken } = client;
export const getAccessSessionKey = (userId) => getOnboardingSessionKey(userId, getAccessToken());
// Login, refresh and logout all rotate the browser's shared HttpOnly cookie.
export const authSessionFetch = (url, options) => withSessionLock(() => fetch(url, options));
