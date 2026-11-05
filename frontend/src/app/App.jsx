import { BrowserRouter } from 'react-router-dom';
import AuthProvider from '../features/auth/AuthProvider';
import AppRoutes from './routes';
import AppErrorBoundary from '../components/common/AppErrorBoundary';

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
