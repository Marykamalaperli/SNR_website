import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import PublicLayout from '../layouts/PublicLayout';
import AuthLayout from '../layouts/AuthLayout';
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
  return (
    <Suspense fallback={<LoadingState />}>
      <Routes>
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
