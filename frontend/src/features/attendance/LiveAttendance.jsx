import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PageHeader from '../../components/dashboard/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceWorkspace } from '../../services/attendanceService';
import AttendanceRecords from './AttendanceRecords';

export default function LiveAttendance({ role, home = false }) {
  const { session } = useAuth();
  const workspace = useRemoteData(loadAttendanceWorkspace);
  const own = role === 'employee';
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
