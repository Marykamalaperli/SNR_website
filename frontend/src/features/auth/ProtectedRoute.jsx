import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingState, ErrorState } from '../../components/common/States';

export default function ProtectedRoute({ role }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Opening your workspace…" />;
  if (!session)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.hash }} />;
  if (session.role !== role) {
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
