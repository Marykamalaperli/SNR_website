import Card from '../../components/common/Card';
import PageHeader from '../../components/dashboard/PageHeader';
import DataTable from '../../components/dashboard/DataTable';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceWorkspace } from '../../services/attendanceService';
import { dateLabel } from './attendanceFormat';

export default function EmployeeSchedule() {
  const workspace = useRemoteData(loadAttendanceWorkspace);
  return (
    <>
      <PageHeader
        eyebrow="A PLAN FOR YOUR WORKDAY"
        title="My schedule"
        description="Your HR-assigned shifts and work sites. Overnight shifts finish the following day."
      />
      <Card>
        <div className="card-heading">
          <div>
            <h2>Your shift assignments</h2>
            <p>Times follow each shift’s time zone.</p>
          </div>
        </div>
        {workspace.loading ? (
          <LoadingState label="Loading your schedule…" />
        ) : workspace.error ? (
          <ErrorState
            title="Your schedule could not be loaded"
            description={workspace.error}
            onRetry={workspace.reload}
          />
        ) : workspace.data.role !== 'employee' ? (
          <ErrorState
            title="Your workspace access changed"
            description="Sign out and sign in again to open your current workspace."
          />
        ) : (
          <DataTable
            caption="My assigned shifts"
            rows={workspace.data.schedule}
            columns={[
              { key: 'name', label: 'Shift' },
              { key: 'site_name', label: 'Site' },
              {
                key: 'hours',
                label: 'Local hours',
                render: (row) =>
                  `${row.starts_at.slice(0, 5)}–${row.ends_at.slice(0, 5)} · ${row.timezone}`,
              },
              { key: 'starts_on', label: 'From', render: (row) => dateLabel(row.starts_on) },
              {
                key: 'ends_on',
                label: 'Until',
                render: (row) => (row.ends_on ? dateLabel(row.ends_on) : 'Ongoing'),
              },
            ]}
            emptyTitle="Your shift has not been assigned yet"
            emptyDescription="Ask HR to assign a shift for your work site. It will appear here when saved."
          />
        )}
      </Card>
    </>
  );
}
