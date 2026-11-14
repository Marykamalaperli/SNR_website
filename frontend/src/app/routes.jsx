import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import AuthLayout from '../layouts/AuthLayout';
import AttendanceQrPage from '../pages/AttendanceQrPage';
import QrAttendancePage from '../pages/QrAttendancePage';
import AttendanceStationPage from '../pages/AttendanceStationPage';
import HomePage from '../pages/HomePage';
import LoginPage from '../pages/LoginPage';
import NotFoundPage from '../pages/NotFoundPage';
import ProtectedRoute from '../features/auth/ProtectedRoute';
import ProductionWorkspace from '../features/auth/ProductionWorkspace';
import { LoadingState } from '../components/common/States';

// Vite replaces DEV at build time. Production contains neither the preview entry nor fixtures.
const DemoWorkspace = import.meta.env.DEV
  ? lazy(() => import('../features/preview/DemoWorkspace'))
  : null;

export default function AppRoutes() {
  const location = useLocation();
  // Printed QR links issued before the attendance-only route remain usable.
  if (
    ['/me/attendance', '/attendance'].includes(location.pathname) &&
    location.hash.startsWith('#employee-qr=')
  )
    return <Navigate to="/login?attendance=1" replace />;
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
        <Route path="attendance" element={<QrAttendancePage />} />
        <Route path="attendance/qr" element={<AttendanceQrPage />} />
        <Route path="attendance/station" element={<AttendanceStationPage />} />
        <Route element={<PublicLayout />}>
          <Route index element={<HomePage />} />
        </Route>
        <Route element={<AuthLayout />}>
          <Route path="login" element={<LoginPage />} />
        </Route>
        {[
          ['employee', 'me'],
          ['supervisor', 'team'],
          ['hr', 'hr'],
        ].map(([role, path]) => (
          <Route key={role} element={<ProtectedRoute role={role} />}>
            <Route path={`${path}/*`} element={<ProductionWorkspace role={role} />} />
          </Route>
        ))}
        {import.meta.env.DEV && <Route path="preview/:workspace/*" element={<DemoWorkspace />} />}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
