import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PageHeader from '../../components/dashboard/PageHeader';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceWorkspace } from '../../services/attendanceService';
import PunchCard from './PunchCard';
import AttendanceRecords from './AttendanceRecords';

export default function LiveAttendance({ role, home = false }) {
  const { session } = useAuth();
  const workspace = useRemoteData(loadAttendanceWorkspace);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState('');
  const own = role === 'employee';
  function refresh(message = '') {
    setNotice(typeof message === 'string' ? message : '');
    workspace.reload();
    setRevision((value) => value + 1);
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
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
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
          {own && <PunchCard workspace={workspace.data} onRecorded={refresh} onRefresh={refresh} />}
          <AttendanceRecords workspace={workspace.data} revision={revision} own={own} />
        </>
      )}
    </>
  );
}
