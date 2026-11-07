import { useCallback, useState } from 'react';
import { ArrowLeft, ArrowRight, Clock3, ListChecks, UsersRound } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { ErrorState, LoadingState } from '../../components/common/States';
import DataTable from '../../components/dashboard/DataTable';
import SummaryStrip from '../../components/dashboard/SummaryStrip';
import FormField from '../../components/forms/FormField';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceRecords } from '../../services/attendanceService';
import { dateLabel, durationLabel, earlierDate, momentLabel } from './attendanceFormat';
import AttendanceLocationDetails from './AttendanceLocationDetails';

export default function AttendanceRecords({ workspace, revision = 0, own = false }) {
  const initial = {
    from: earlierDate(workspace.today, 6),
    to: workspace.today,
    site: '',
    department: '',
    search: '',
    status: 'all',
    page: 1,
  };
  const [filters, setFilters] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [validation, setValidation] = useState('');
  const [locationRow, setLocationRow] = useState(null);
  const loader = useCallback(() => {
    void revision;
    return loadAttendanceRecords(filters);
  }, [filters, revision]);
  const records = useRemoteData(loader);
  const field = (name) => ({
    value: draft[name],
    onChange: (event) => setDraft((current) => ({ ...current, [name]: event.target.value })),
  });
  function apply(event) {
    event.preventDefault();
    if (
      !draft.from ||
      !draft.to ||
      draft.from > draft.to ||
      Date.parse(draft.to) - Date.parse(draft.from) > 30 * 86400000
    ) {
      setValidation('Choose a date range of up to 31 days.');
      return;
    }
    setValidation('');
    setFilters({ ...draft, page: 1 });
  }
  const columns = [
    ...(!own
      ? [
          {
            key: 'person',
            label: 'Person',
            render: (row) => (
              <div className="directory-person">
                <div>
                  <strong>{row.display_name}</strong>
                  <small>
                    {row.employee_number} · {row.department_name}
                  </small>
                </div>
              </div>
            ),
          },
        ]
      : []),
    { key: 'attendance_date', label: 'Work date', render: (row) => dateLabel(row.attendance_date) },
    {
      key: 'shift_name',
      label: 'Shift · site',
      render: (row) => (
        <div className="live-record-detail">
          <strong>{row.shift_name}</strong>
          <small>
            {row.site_name} · {row.timezone}
          </small>
        </div>
      ),
    },
    {
      key: 'clock_in',
      label: 'Clock-in',
      render: (row) => momentLabel(row.clock_in, row.timezone),
    },
    {
      key: 'clock_out',
      label: 'Clock-out',
      render: (row) => (row.clock_out ? momentLabel(row.clock_out, row.timezone) : 'In progress'),
    },
    {
      key: 'duration_seconds',
      label: 'Recorded time',
      render: (row) => durationLabel(row.duration_seconds),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <StatusBadge tone={row.status === 'open' ? 'positive' : 'neutral'}>
          {row.status === 'open' ? 'Clocked in' : 'Clocked out'}
        </StatusBadge>
      ),
    },
    ...(own || workspace.role === 'hr'
      ? [
          {
            key: 'location',
            label: 'Location',
            render: (row) =>
              row.clock_in_location_available || row.clock_out_location_available ? (
                <Button
                  variant="text"
                  onClick={() => setLocationRow(row)}
                  aria-label={`View locations ${row.employee_number} ${dateLabel(row.attendance_date)}`}
                >
                  View locations
                </Button>
              ) : (
                <span className="muted">Not collected</span>
              ),
          },
        ]
      : []),
  ];
  return (
    <>
      {records.data && (
        <div className="live-attendance-summary">
          <SummaryStrip
            items={[
              {
                label: 'Recorded sessions',
                value: records.data.summary.sessions,
                description: 'Within the selected filters',
                icon: ListChecks,
              },
              {
                label: 'Open sessions',
                value: records.data.summary.open,
                description: 'Clock-out not recorded yet',
                icon: UsersRound,
                tone: 'teal',
              },
              {
                label: 'Completed time',
                value: durationLabel(records.data.summary.completed_seconds),
                description: 'Completed sessions only',
                icon: Clock3,
                tone: 'gold',
              },
            ]}
          />
        </div>
      )}
      <Card className="directory-card">
        <div className="card-heading">
          <div>
            <h2>{own ? 'Your attendance history' : 'Attendance records'}</h2>
            <p>
              Dates and times follow each assigned shift’s time zone. Completed time excludes open
              sessions.
            </p>
          </div>
        </div>
        <form className="live-attendance-filters" onSubmit={apply}>
          <FormField label="From date" type="date" required {...field('from')} />
          <FormField label="To date" type="date" required {...field('to')} />
          {!own && (
            <>
              <FormField
                label="Find a person"
                type="search"
                maxLength={80}
                placeholder="Name or employee number"
                {...field('search')}
              />
              <FormField label="Work site">
                {(props) => (
                  <select {...props} {...field('site')}>
                    <option value="">All permitted sites</option>
                    {workspace.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Department">
                {(props) => (
                  <select {...props} {...field('department')}>
                    <option value="">All permitted departments</option>
                    {workspace.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </>
          )}
          <FormField label="Attendance status">
            {(props) => (
              <select {...props} {...field('status')}>
                <option value="all">All sessions</option>
                <option value="open">Clocked in</option>
                <option value="closed">Clocked out</option>
              </select>
            )}
          </FormField>
          <Button type="submit" variant="secondary">
            Apply filters
          </Button>
        </form>
        {validation && (
          <p className="form-error live-filter-error" role="alert">
            {validation}
          </p>
        )}
        {records.loading ? (
          <LoadingState label="Loading attendance…" />
        ) : records.error ? (
          <ErrorState
            title="Attendance could not be loaded"
            description={records.error}
            onRetry={records.reload}
          />
        ) : (
          <>
            {records.data.rows.length > 0 && (
              <p className="directory-table-hint">
                Swipe across the table for clock-out times and status.
              </p>
            )}
            <DataTable
              caption={own ? 'My attendance records' : 'Permitted attendance records'}
              columns={columns}
              rows={records.data.rows}
              emptyTitle="No attendance matches these dates"
              emptyDescription={
                own
                  ? 'Recorded clock-ins and clock-outs will appear here.'
                  : 'Review the date range and filters. Employees need an assigned shift before clocking in.'
              }
            />
            {records.data.total > 0 && (
              <div className="directory-pagination">
                <p role="status">
                  Page {filters.page} · {records.data.total}{' '}
                  {records.data.total === 1 ? 'session' : 'sessions'}
                </p>
                <div>
                  <Button
                    variant="secondary"
                    disabled={filters.page === 1}
                    onClick={() => setFilters((value) => ({ ...value, page: value.page - 1 }))}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={filters.page * records.data.page_size >= records.data.total}
                    onClick={() => setFilters((value) => ({ ...value, page: value.page + 1 }))}
                  >
                    Next
                    <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      {locationRow && (
        <AttendanceLocationDetails row={locationRow} onClose={() => setLocationRow(null)} />
      )}
    </>
  );
}
