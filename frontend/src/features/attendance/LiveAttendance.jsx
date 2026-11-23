import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PageHeader from '../../components/dashboard/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceWorkspace } from '../../services/attendanceService';
import AttendanceRecords from './AttendanceRecords';
import StoreQRStation from './StoreQRStation';
import TargetPunchCard from './TargetPunchCard';
import TargetAttendanceHistory from './TargetAttendanceHistory';
import TargetAttendanceDays from './TargetAttendanceDays';
import { config } from '../../lib/config';

const NOOP_LOADER = () => Promise.resolve(null);

export default function LiveAttendance({ role, home = false }) {
  const { session } = useAuth();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const isTargetApi = Boolean(
    config.apiBaseUrl && (!config.supabaseUrl || config.sessionSource === 'api'),
  );

  const workspace = useRemoteData(isTargetApi ? NOOP_LOADER : loadAttendanceWorkspace);
  const own = role === 'employee';

  if (isTargetApi) {
    const storeId = session?.store_id || '20000000-0000-4000-8000-000000000001';
    return (
      <>
        <PageHeader
          eyebrow={own ? 'YOUR WORKDAY, RECORDED' : 'STORE ATTENDANCE STATION'}
          title={
            home
              ? `Welcome, ${session?.display_name || 'User'}.`
              : own
                ? 'My attendance'
                : role === 'hr'
                  ? 'Attendance'
                  : 'Team attendance'
          }
          description={
            own
              ? 'Your attendance workstation. Scan the store QR challenge to clock in and out.'
              : 'Live rotating store QR code and recorded attendance events.'
          }
        />
        {own ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <TargetPunchCard
              storeId={storeId}
              onPunchSuccess={() => setRefreshTrigger((prev) => prev + 1)}
            />
            <TargetAttendanceDays role="employee" storeId={storeId} />
            <TargetAttendanceHistory refreshTrigger={refreshTrigger} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <StoreQRStation storeId={storeId} />
            <TargetAttendanceDays
              role={
                role === 'supervisor'
                  ? 'store_admin'
                  : role === 'hr'
                    ? 'hr_payroll'
                    : role || 'store_admin'
              }
              storeId={storeId}
            />
            <TargetAttendanceHistory storeId={storeId} refreshTrigger={refreshTrigger} />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={own ? 'YOUR WORKDAY, RECORDED' : 'YOUR PEOPLE’S WORKDAY'}
        title={
          home
            ? `Welcome, ${session.display_name}.`
            : own
              ? 'My attendance'
              : role === 'hr'
                ? 'Attendance'
                : 'Team attendance'
        }
        description={
          own
            ? `Your workday at ${session.organization_name}.`
            : role === 'hr'
              ? 'Recorded attendance across your organization’s work sites.'
              : 'Attendance for people in your assigned departments and sites.'
        }
        action={
          role === 'hr' ? (
            <Button to="/hr/employees">
              Manage employee shifts
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          ) : undefined
        }
      />
      {workspace.loading && <LoadingState label="Loading attendance status…" />}
      {workspace.error && (
        <Card>
          <ErrorState
            title="Attendance is not ready"
            description={workspace.error}
            onRetry={workspace.reload}
          />
        </Card>
      )}
      {workspace.data && workspace.data.role !== role && (
        <Card>
          <ErrorState
            title="Your workspace access changed"
            description="Sign out and sign in again to open your current workspace."
          />
        </Card>
      )}
      {workspace.data && workspace.data.role === role && (
        <>
          {own && (
            <Card className="live-punch-card">
              <h2>Record attendance securely</h2>
              <p>
                Use your own sign-in, approved passkey, precise location and a fresh selfie on the
                security attendance page.
              </p>
              <Button to="/attendance">
                Open security attendance
                <ArrowRight size={18} />
              </Button>
            </Card>
          )}
          <AttendanceRecords workspace={workspace.data} revision={0} own={own} />
        </>
      )}
    </>
  );
}
