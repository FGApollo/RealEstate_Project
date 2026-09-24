import { API_BASE_URL } from '../config';

let accessToken = null;
let refreshPromise = null;

export const setAccessToken = (token) => {
  accessToken = token || null;
};

export const clearAccessToken = () => {
  accessToken = null;
};

export const restoreSession = () => {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    }).then(async (response) => {
      if (response.status === 401) {
        clearAccessToken();
        return null;
      }
      if (!response.ok) throw new Error('Could not restore session');

      const data = await response.json();
      setAccessToken(data.accessToken);
      return data.user;
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

export const apiFetch = async (url, options = {}) => {
  if (typeof url !== 'string' || !url.startsWith(`${API_BASE_URL}/api/`)) {
    return fetch(url, options);
  }

  if (!accessToken) {
    await restoreSession();
  }

  const send = () => {
    const headers = new Headers(options.headers || {});
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(url, { ...options, headers, credentials: 'include' });
  };

  let response = await send();
  if (response.status === 401 && accessToken) {
    clearAccessToken();
    const user = await restoreSession();
    if (user) {
      response = await send();
    } else {
      window.dispatchEvent(new Event('auth:expired'));
    }
  }

  return response;
};
