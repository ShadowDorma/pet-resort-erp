import { Navigate, useLocation } from 'react-router-dom';
import { getHomePath, getUserRoles, useAuth, userCanAccess } from '../context/AuthContext';

function Loading() {
  return <p className="text-primary-dark">Cargando sesión...</p>;
}

export function ProtectedRoute({ children, roles = [] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <Loading />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location.pathname }} />;
  }

  if (getUserRoles(user).includes('ADMIN')) {
    return children;
  }

  if (roles.length === 0 || userCanAccess(user, roles)) {
    return children;
  }

  const home = getHomePath(user);
  if (home === location.pathname) {
    return children;
  }

  return <Navigate to={home} replace />;
}

export function GuestRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Loading />;
  }

  if (user) {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return children;
}

export default ProtectedRoute;
