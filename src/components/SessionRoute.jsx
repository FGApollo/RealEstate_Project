import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { normalizeRole, roleDestination } from '../auth/roleDestination.js';
import AuthLoading from './AuthLoading';

// Resolve the backend session before mounting either the customer home or a login form.
export default function SessionRoute({ guestOnly = false }) {
  const { user, authStatus } = useAuth();
  if (authStatus === 'authenticating') return <AuthLoading />;
  const role = normalizeRole(user?.role);
  if (role && (guestOnly || role !== 'USER')) return <Navigate to={roleDestination(role)} replace />;
  return <Outlet />;
}
