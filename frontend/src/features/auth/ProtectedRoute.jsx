import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState, ErrorState } from '../../components/common/States';

export default function ProtectedRoute({ role }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Opening your workspace…" />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.hash }} />;
  const isSuperAdmin =
    session.role === 'admin' ||
    session.actual_role === 'system_admin' ||
    session.scopes?.some((s) => s.role === 'system_admin');
  if (isSuperAdmin && role === 'hr') {
    return <Navigate to="/admin/stores" replace />;
  }
  if (session.role !== role && !(isSuperAdmin && ['admin', 'hr'].includes(role))) {
    return (
      <ErrorState
        title="This workspace isn’t assigned to you"
        description="Open the workspace assigned to your account."
        href={session.workspace}
      />
    );
  }
  return <Outlet />;
}
