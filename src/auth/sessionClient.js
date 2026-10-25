import { isSessionUser } from './roleDestination.js';

export const withSessionLock = (work) => globalThis.navigator?.locks?.request
  ? navigator.locks.request('swipe-nest-session', work) : work();

export const createSessionClient = ({ apiBaseUrl, fetchImpl, onUser = () => {}, onExpired = () => {}, withLock = (work) => work() }) => {
  const base = new URL(apiBaseUrl);
  const apiPath = `${base.pathname.replace(/\/$/, '')}/api/`;
  let accessToken = null;
  let userId = null;
  let generation = 0;
  let refreshTask = null;
  const abort = () => new DOMException('The account session changed. Please try again.', 'AbortError');
  const assertGeneration = (expected) => { if (expected !== generation) throw abort(); };
  const isApiUrl = (value) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return !url.username && !url.password && url.origin === base.origin && url.pathname.startsWith(apiPath);
    } catch { return false; }
  };
  const clearAccessToken = () => { generation += 1; accessToken = null; userId = null; };
  const setAccessToken = (token, nextUserId) => {
    generation += 1;
    accessToken = typeof token === 'string' && token ? token : null;
    userId = nextUserId == null ? null : String(nextUserId);
  };
  const expire = () => { clearAccessToken(); onExpired(); };
  const send = (url, options) => {
    const headers = new Headers(options.headers || {});
    headers.delete('Authorization');
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetchImpl(url, { ...options, headers, credentials: 'include' });
  };
  const restoreSession = () => {
    const expected = generation;
    if (refreshTask?.generation === expected) return refreshTask.promise;
    const promise = withLock(async () => {
      assertGeneration(expected);
      const response = await fetchImpl(`${apiBaseUrl.replace(/\/$/, '')}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      assertGeneration(expected);
      if (response.status === 401) {
        const wasAuthenticated = accessToken !== null;
        accessToken = null;
        userId = null;
        if (wasAuthenticated) expire();
        return null;
      }
      if (!response.ok) throw new Error('Không thể khôi phục phiên đăng nhập.');
      const data = await response.json();
      assertGeneration(expected);
      if (!isSessionUser(data.user) || typeof data.accessToken !== 'string' || !data.accessToken) {
        expire();
        throw new Error('Phiên đăng nhập không hợp lệ.');
      }
      if (userId !== null && userId !== String(data.user.id)) {
        expire();
        throw abort();
      }
      accessToken = data.accessToken;
      userId = String(data.user.id);
      onUser(data.user);
      return data.user;
    }).finally(() => { if (refreshTask?.promise === promise) refreshTask = null; });
    refreshTask = { generation: expected, promise };
    return promise;
  };
  const apiFetch = async (url, options = {}) => {
    if (!isApiUrl(url)) return fetchImpl(url, options);
    const expected = generation;
    if (!accessToken) await restoreSession();
    assertGeneration(expected);
    const attemptedToken = accessToken;
    let response = await send(url, options);
    assertGeneration(expected);
    if (response.status === 401 && attemptedToken) {
      if (accessToken === attemptedToken) await restoreSession();
      assertGeneration(expected);
      if (accessToken) {
        response = await send(url, options);
        assertGeneration(expected);
        if (response.status === 401) expire();
      }
    }
    return response;
  };
  return {
    setAccessToken, clearAccessToken, restoreSession, apiFetch,
    getAccessToken: () => accessToken,
    publicApiFetch: (url, options = {}) => isApiUrl(url) ? send(url, options) : fetchImpl(url, options)
  };
};
