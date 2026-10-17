export const normalizeRole = (role) => {
  const value = typeof role === 'string' ? role.toUpperCase() : '';
  return ['USER', 'AGENT', 'ADMIN'].includes(value) ? value : null;
};

export const roleDestination = (role) => {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === 'ADMIN') return '/admin';
  if (normalizedRole === 'AGENT') return '/sale/overview';
  return normalizedRole === 'USER' ? '/' : '/login';
};

export const isSessionUser = (user) => Boolean(user && ['string', 'number'].includes(typeof user.id)
  && /^[1-9]\d*$/.test(String(user.id)) && Number.isSafeInteger(Number(user.id))
  && normalizeRole(user.role) && user.is_active === true);

export const canResumeAuthAction = (role, action) => {
  const normalizedRole = normalizeRole(role);
  if (!normalizedRole || !action) return false;
  if (action.type === 'FAVORITE_PROPERTY' || action.type === 'OPEN_CHAT_BY_PROPERTY') return normalizedRole === 'USER';
  if (action.type !== 'NAVIGATE') return false;
  const path = String(action.returnTo || '').split('?')[0];
  if (normalizedRole === 'ADMIN') return path === '/admin';
  if (normalizedRole === 'AGENT') return path === '/sale/overview' || path === '/chat'
    || /^\/sale\/payment\/[0-9a-f-]{36}$/i.test(path);
  return ['/', '/onboarding', '/profile', '/chat'].includes(path) || /^\/swipe\/[^/]+$/.test(path);
};
