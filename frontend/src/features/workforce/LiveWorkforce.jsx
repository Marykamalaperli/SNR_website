import { useLocation } from 'react-router-dom';
import VerifiedWorkspace from '../auth/VerifiedWorkspace';
import HrDashboard from './HrDashboard';
import EmployeeDirectory from './EmployeeDirectory';
import OrganizationSetup from './OrganizationSetup';
import EmployeeProfile from './EmployeeProfile';

export default function LiveWorkforce({ role, base }) {
  const { pathname } = useLocation();
  const section = pathname.slice(base.length).replace(/^\/|\/$/g, '');
  if (role === 'hr') {
    if (!section) return <HrDashboard />;
    if (section === 'employees') return <EmployeeDirectory manage />;
    if (section === 'sites') return <OrganizationSetup />;
  }
  if (role === 'supervisor' && section === 'members') return <EmployeeDirectory />;
  if (role === 'employee' && section === 'profile') return <EmployeeProfile />;
  return <VerifiedWorkspace />;
}
