const STORAGE_KEY = 'swipeNest.pendingAuthAction.v1';
const MAX_AGE_MS = 30 * 60 * 1000;

const normalizeId = (value) => {
  const id = String(value ?? '');
  return /^\d{1,20}$/.test(id) && Number(id) > 0 ? id : null;
};

const safeReturnTo = (value) => {
  if (typeof value !== 'string' || value.length > 1200 || !value.startsWith('/')
    || value.startsWith('//') || value.includes('\\')
    || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return null;

  let url;
  try {
    url = new URL(value, 'https://swipenest.invalid');
  } catch {
    return null;
  }
  if (url.origin !== 'https://swipenest.invalid') return null;

  const pathname = url.pathname;
  const isSwipe = /^\/swipe\/[^/]+\/?$/.test(pathname);
  if (!(pathname === '/' || pathname === '/onboarding' || pathname === '/chat'
    || pathname === '/profile' || pathname === '/sale/overview' || pathname === '/admin' || isSwipe)) return null;

  if (isSwipe) {
    try {
      const category = decodeURIComponent(pathname.slice('/swipe/'.length).replace(/\/$/, ''));
      if (!category || category.includes('/') || category.includes('\\') || category === '..') return null;
    } catch {
      return null;
    }
  }

  const allowedQueryKeys = pathname === '/' ? new Set(['propertyId'])
    : pathname === '/chat' ? new Set(['propertyId']) : new Set();
  for (const [key, item] of url.searchParams.entries()) {
    if (!allowedQueryKeys.has(key) || (key === 'propertyId' && !normalizeId(item))) return null;
  }

  return `${url.pathname}${url.search}`;
};

const normalizeRouteState = (state) => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return undefined;
  const normalized = {};
  if (state.activeView === 'saved' || state.activeView === 'swipe') normalized.activeView = state.activeView;
  const propertyId = normalizeId(state.selectPropertyId);
  if (propertyId) normalized.selectPropertyId = Number(propertyId);
  if (state.filters && typeof state.filters === 'object' && !Array.isArray(state.filters)) {
    const filters = {};
    for (const key of ['minPrice', 'maxPrice', 'minArea', 'maxArea']) {
      const value = state.filters[key];
      if (value === '') filters[key] = '';
      else if (value !== undefined && Number.isFinite(Number(value)) && Number(value) >= 0) filters[key] = String(value);
    }
    for (const key of ['wards', 'lifestyles', 'categories']) {
      const value = state.filters[key];
      if (Array.isArray(value)) filters[key] = value.slice(0, 20)
        .filter((item) => typeof item === 'string' && item.trim() && item.length <= 80)
        .map((item) => item.trim());
    }
    if (Array.isArray(state.filters.bedrooms)) {
      filters.bedrooms = state.filters.bedrooms.slice(0, 12)
        .map(Number).filter((item) => Number.isInteger(item) && item >= 0 && item <= 20);
    }
    normalized.filters = filters;
  }
  return Object.keys(normalized).length ? normalized : undefined;
};

export const normalizePendingAuthAction = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const returnTo = safeReturnTo(input.returnTo);

  if (input.type === 'FAVORITE_PROPERTY') {
    const propertyId = normalizeId(input.propertyId);
    if (!propertyId) return null;
    return {
      type: input.type,
      propertyId,
      returnTo: returnTo || `/?propertyId=${propertyId}`,
      ...(normalizeRouteState(input.routeState) ? { routeState: normalizeRouteState(input.routeState) } : {})
    };
  }

  if (input.type === 'OPEN_CHAT_BY_PROPERTY') {
    const propertyId = normalizeId(input.propertyId);
    if (!propertyId) return null;
    return { type: input.type, propertyId };
  }

  if (input.type === 'NAVIGATE' && returnTo) {
    const routeState = normalizeRouteState(input.routeState);
    return { type: input.type, returnTo, ...(routeState ? { routeState } : {}) };
  }

  return null;
};

const getSessionStorage = () => {
  try { return window.sessionStorage; } catch { return null; }
};

export const savePendingAuthAction = (input) => {
  const action = normalizePendingAuthAction(input);
  const storage = getSessionStorage();
  if (!action || !storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, createdAt: Date.now(), action }));
    return true;
  } catch {
    return false;
  }
};

export const readPendingAuthAction = () => {
  const storage = getSessionStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (record?.version !== 1 || !Number.isFinite(record.createdAt)
      || Date.now() - record.createdAt > MAX_AGE_MS || record.createdAt > Date.now() + 60_000) {
      storage.removeItem(STORAGE_KEY);
      return null;
    }
    const action = normalizePendingAuthAction(record.action);
    if (!action) storage.removeItem(STORAGE_KEY);
    return action;
  } catch {
    try { storage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
    return null;
  }
};

export const clearPendingAuthAction = () => {
  try { getSessionStorage()?.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
};

export const savePendingRouteIfMissing = (returnTo, routeState) => {
  if (readPendingAuthAction()) return false;
  return savePendingAuthAction({ type: 'NAVIGATE', returnTo, routeState });
};
