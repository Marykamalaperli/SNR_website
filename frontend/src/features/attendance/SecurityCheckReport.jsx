import { useCallback, useState } from 'react';
import PageHeader from '../../components/dashboard/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { LoadingState, ErrorState } from '../../components/common/States';
import DataTable from '../../components/dashboard/DataTable';
import FormField from '../../components/forms/FormField';
import useRemoteData from '../../hooks/useRemoteData';
import { loadSecurityReport, openSecurityPhoto } from '../../services/securityAttendanceService';

export default function SecurityCheckReport() {
  const [range, setRange] = useState(() => ({
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  }));
  const loader = useCallback(() => loadSecurityReport(range.from, range.to), [range]);
  const report = useRemoteData(loader);
  const [photo, setPhoto] = useState(null),
    [error, setError] = useState('');
  async function view(id) {
    setError('');
    try {
      setPhoto(await openSecurityPhoto(id));
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="ATTENDANCE SECURITY"
        title="Security photo checks"
        description="Review completed and missed two-minute checks. A missed check needs review; it is not proof of absence or misconduct."
        action={
          <Button href="/attendance/qr" target="_blank" rel="noopener noreferrer">
            Open attendance QR
          </Button>
        }
      />
      <Card className="security-review-card">
        <form
          className="directory-filters"
          onSubmit={(event) => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            setRange({ from: values.get('from'), to: values.get('to') });
          }}
        >
          <FormField
            type="date"
            name="from"
            label="From date (UTC)"
            required
            defaultValue={range.from}
          />
          <FormField type="date" name="to" label="To date (UTC)" required defaultValue={range.to} />
          <Button type="submit" variant="secondary">
            Apply dates
          </Button>
        </form>
        <p className="field-hint">
          Up to 31 days and 500 checks per result. Future request times are available only to
          authorized HR, not employees.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {report.loading ? (
          <LoadingState />
        ) : report.error ? (
          <ErrorState description={report.error} onRetry={report.reload} />
        ) : (
          <DataTable
            caption="Security photo checks"
            rows={report.data.rows}
            columns={[
              { key: 'display_name', label: 'Employee' },
              {
                key: 'due_at',
                label: 'Requested (UTC)',
                render: (row) => new Date(row.due_at).toISOString().replace('T', ' ').slice(0, 19),
              },
              {
                key: 'status',
                label: 'Result',
                render: (row) =>
                  ({
                    completed: 'Completed',
                    missed: 'Missed · review needed',
                    cancelled: 'Shift ended before request',
                    pending: 'Pending',
                  })[row.status],
              },
              {
                key: 'photo',
                label: 'Evidence',
                render: (row) =>
                  row.photo ? (
                    <Button variant="text" onClick={() => view(row.id)}>
                      View private photo
                    </Button>
                  ) : (
                    <span>—</span>
                  ),
              },
            ]}
            emptyTitle="No photo checks in this range"
            emptyDescription="Enable three or four checks for selected security staff in Employees → Attendance security. This affects their next clock-in."
          />
        )}
      </Card>
      {photo && (
        <Modal title="Private security photo" onClose={() => setPhoto(null)}>
          <img
            className="security-report-photo"
            src={photo.signed_url}
            alt="Employee security check evidence"
          />
          <p>
            Store check: {Number(photo.distance_meters).toFixed(1)} metres · radius{' '}
            {photo.radius_meters} metres.
          </p>
          <p>Recorded: {new Date(photo.recorded_at).toLocaleString()}.</p>
        </Modal>
      )}
    </>
  );
}
