import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const ProtectedRoute = ({ allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div role="status">Đang xác thực...</div>;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && !allowedRoles.includes(String(user.role).toUpperCase())) {
    return <Navigate to="/" replace />;
  }

  return <Outlet context={{ currentUser: user }} />;
};

export default ProtectedRoute;
