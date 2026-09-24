import ProtectedRoute from './ProtectedRoute';

const AdminRoute = () => <ProtectedRoute allowedRoles={['ADMIN']} />;

export default AdminRoute;
