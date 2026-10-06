const STORAGE_KEY = 'swipeNest.onboardingSkipped.v1';
let skippedSessionKey = null;

const getStorage = () => {
  try { return globalThis.window?.sessionStorage; } catch { return null; }
};

// This key scopes optional survey UI only. The backend still authenticates every session.
export const getOnboardingSessionKey = (userId, token) => {
  try {
    if (!/^\d+$/.test(String(userId))) return null;
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    if (payload.token_use !== 'access' || String(payload.sub) !== String(userId)
      || typeof payload.sid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(payload.sid)) return null;
    return String(userId) + ':' + payload.sid;
  } catch {
    return null;
  }
};

export const skipOnboardingForSession = (sessionKey) => {
  if (!sessionKey) return;
  skippedSessionKey = sessionKey;
  try { getStorage()?.setItem(STORAGE_KEY, sessionKey); } catch { /* Keep the current tab state. */ }
};

export const hasSkippedOnboardingForSession = (sessionKey) => {
  if (!sessionKey) return false;
  try {
    return (getStorage()?.getItem(STORAGE_KEY) ?? skippedSessionKey) === sessionKey;
  } catch {
    return skippedSessionKey === sessionKey;
  }
};

export const clearOnboardingSkip = () => {
  skippedSessionKey = null;
  try { getStorage()?.removeItem(STORAGE_KEY); } catch { /* Storage can be unavailable. */ }
};

export const effectiveOnboardingStatus = (status, sessionKey) => (
  status === 'required' && hasSkippedOnboardingForSession(sessionKey) ? 'skipped' : status
);
