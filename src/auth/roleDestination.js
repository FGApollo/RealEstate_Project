export const roleDestination = (role) => {
  const normalizedRole = String(role || '').toUpperCase();
  if (normalizedRole === 'ADMIN') return '/admin';
  if (normalizedRole === 'AGENT') return '/sale/overview';
  return '/';
};
