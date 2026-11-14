import { useLocation } from 'react-router-dom';
import VerifiedWorkspace from '../auth/VerifiedWorkspace';
import HrDashboard from './HrDashboard';
import EmployeeDirectory from './EmployeeDirectory';
import OrganizationSetup from './OrganizationSetup';
import EmployeeProfile from './EmployeeProfile';
import HrSettings from './HrSettings';
import LiveAttendance from '../attendance/LiveAttendance';
import EmployeeSchedule from '../attendance/EmployeeSchedule';
import SecurityCheckReport from '../attendance/SecurityCheckReport';

export default function LiveWorkforce({ role, base }) {
  const { pathname } = useLocation();
  const section = pathname.slice(base.length).replace(/^\/|\/$/g, '');
  if (section === 'attendance' || (!section && role === 'supervisor'))
    return <LiveAttendance role={role} home={!section} />;
  if (role === 'hr') {
    if (!section) return <HrDashboard />;
    if (section === 'employees') return <EmployeeDirectory manage />;
    if (section === 'sites') return <OrganizationSetup />;
    if (section === 'security') return <SecurityCheckReport />;
    if (section === 'settings') return <HrSettings />;
  }
  if (role === 'supervisor' && section === 'members') return <EmployeeDirectory />;
  if (role === 'employee' && section === 'profile') return <EmployeeProfile />;
  if (role === 'employee' && !section) return <LiveAttendance role={role} home />;
  if (role === 'employee' && section === 'schedule') return <EmployeeSchedule />;
  return <VerifiedWorkspace />;
}
