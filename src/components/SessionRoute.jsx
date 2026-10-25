import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { canResumeAuthAction, normalizeRole, roleDestination } from '../auth/roleDestination.js';
import { normalizePendingAuthAction } from '../auth/pendingAuthAction.js';
import AuthLoading from './AuthLoading';

// Resolve the backend session before mounting either the customer home or a login form.
export default function SessionRoute({ guestOnly = false }) {
  const { user, authStatus } = useAuth();
  const location = useLocation();
  if (authStatus === 'authenticating') return <AuthLoading />;
  const role = normalizeRole(user?.role);
  if (role && (guestOnly || role !== 'USER')) {
    const returnAction = guestOnly ? normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: location.state?.returnTo }) : null;
    // A login completion and the guest guard can render in the same transition.
    // Both must select the same validated destination, including payOS returns.
    const destination = canResumeAuthAction(role, returnAction) ? returnAction.returnTo : roleDestination(role);
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}
