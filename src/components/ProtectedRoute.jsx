import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getDashboardPath, normalizeRole } from '../lib/adminAuth';

export default function ProtectedRoute({ isAuthenticated, allowedRoles, children }) {
  const { user } = useAuth();
  const location = useLocation();

  const authenticated = isAuthenticated ?? Boolean(user);

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const role = normalizeRole(user?.role);
    if (!role || !allowedRoles.includes(role)) {
      return <Navigate to={getDashboardPath(role)} replace />;
    }
  }

  return children ?? <Outlet />;
}
