import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import AuthLoading from './AuthLoading';
import { normalizeRole, roleDestination } from '../auth/roleDestination.js';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, authStatus, onboardingStatus } = useAuth();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const isOnboarding = location.pathname === '/onboarding';

  if (authStatus === 'authenticating') return <AuthLoading />;

  const role = normalizeRole(user?.role);
  if (!user || !role || authStatus !== 'authenticated') {
    const loginPath = allowedRoles?.includes('AGENT') ? '/login/agent' : '/login';
    return <Navigate to={loginPath} replace state={{ returnTo }} />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={roleDestination(role)} replace />;
  }

  if (isOnboarding && String(user.role).toUpperCase() !== 'USER') {
    const fallback = String(user.role).toUpperCase() === 'AGENT' ? '/sale/overview' : '/admin';
    return <Navigate to={fallback} replace />;
  }

  if (String(user.role).toUpperCase() === 'USER' && !isOnboarding && onboardingStatus === 'checking') {
    return <AuthLoading />;
  }

  if (String(user.role).toUpperCase() === 'USER' && !isOnboarding && onboardingStatus === 'required') {
    return <Navigate to="/onboarding" replace state={{ returnTo }} />;
  }

  return <Outlet context={{ currentUser: user }} />;
};

export default ProtectedRoute;
