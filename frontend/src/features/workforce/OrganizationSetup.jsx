import { useState } from 'react';
import { Building2, CalendarDays, Layers3, Plus, Pencil } from 'lucide-react';
import PageHeader from '../../components/dashboard/PageHeader';
import DataTable from '../../components/dashboard/DataTable';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import FormField from '../../components/forms/FormField';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadOrganization, saveOrganizationRecord } from '../../services/workforceService';
import RecordForm from './RecordForm';
import SelectField from './SelectField';
import StoreAreaEditor from './StoreAreaEditor';
import AttendanceSiteEditor from './AttendanceSiteEditor';
import StoreAttendanceQr from './StoreAttendanceQr';

function SetupForm({ kind, record, organization, onClose, onSaved }) {
  if (kind === 'site')
    return (
      <AttendanceSiteEditor
        record={record}
        organization={organization}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  const title = `${record ? 'Edit' : 'Add'} ${kind}`;
  return (
    <RecordForm
      title={title}
      onClose={onClose}
      submitLabel={record ? 'Save changes' : `Add ${kind}`}
      onSave={async (values) => {
        await saveOrganizationRecord(kind, values, record);
        onSaved(`${kind[0].toUpperCase() + kind.slice(1)} saved.`);
      }}
    >
      <FormField
        label={`${kind[0].toUpperCase() + kind.slice(1)} name`}
        name="name"
        required
        maxLength={120}
        defaultValue={record?.name || ''}
        autoComplete="off"
      />
      {kind === 'site' && (
        <FormField
          label="Time zone"
          name="timezone"
          required
          maxLength={80}
          defaultValue={record?.timezone || organization.organization.timezone}
          hint="Use an IANA time zone, such as Asia/Kolkata or Europe/London. Shifts keep the time zone saved with their schedule."
        />
      )}
      {kind === 'shift' && (
        <>
          <SelectField
            label="Site"
            name="site_id"
            required
            placeholder="Choose a site"
            defaultValue={record?.site_id || ''}
            options={organization.sites.filter((site) => site.active)}
          />
          <div className="form-grid">
            <FormField
              label="Start time"
              name="starts_at"
              type="time"
              required
              defaultValue={record?.starts_at?.slice(0, 5) || ''}
            />
            <FormField
              label="End time"
              name="ends_at"
              type="time"
              required
              defaultValue={record?.ends_at?.slice(0, 5) || ''}
            />
          </div>
          <p className="field-hint">
            Times use the site’s time zone. An end time before the start time ends on the next day.
            Employee shift assignments will be added with attendance.
          </p>
        </>
      )}
    </RecordForm>
  );
}

export default function OrganizationSetup() {
  const { data, loading, error, reload } = useRemoteData(loadOrganization);
  const [editor, setEditor] = useState(null);
  const [areaSite, setAreaSite] = useState(null);
  const [qrSite, setQrSite] = useState(null);
  const [notice, setNotice] = useState('');
  const edit = (kind, record = null) => setEditor({ kind, record });
  return (
    <>
      <PageHeader
        eyebrow="A PLACE FOR YOUR PEOPLE"
        title="Organization setup"
        description="Give every person a place, a team and a plan for their day."
      />
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <LoadingState label="Loading your organization…" />
      ) : error ? (
        <Card>
          <ErrorState
            title="Organization could not be loaded"
            description={error}
            onRetry={reload}
          />
        </Card>
      ) : (
        <>
          <div className="workforce-intro">
            <span className="feature-icon tone-orange">
              <Building2 aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">YOUR ORGANIZATION</p>
              <h2>{data.organization.name}</h2>
              <p className="muted">Organization time zone · {data.organization.timezone}</p>
            </div>
            <Button to="/hr/employees" variant="secondary">
              Open employee directory
            </Button>
          </div>
          <Card>
            <div className="card-heading">
              <div>
                <h2>Sites</h2>
                <p>The places where your team works.</p>
              </div>
              <Button onClick={() => edit('site')}>
                <Plus size={17} aria-hidden="true" />
                Add site
              </Button>
            </div>
            {data.sites.length ? (
              <div className="workforce-site-grid">
                {data.sites.map((site) => (
                  <article className="workforce-site" key={site.id}>
                    <span className="feature-icon tone-orange">
                      <Building2 size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{site.name}</h3>
                      <p className="muted">{site.timezone}</p>
                      <small className="muted">
                        Shift templates ·{' '}
                        {data.shifts.filter((shift) => shift.site_id === site.id).length}
                      </small>
                      <p className="field-hint">
                        {site.attendance_area_configured
                          ? `Attendance area · ${site.attendance_radius_meters} metres`
                          : 'Attendance area required before clock-in or clock-out.'}
                      </p>
                      <Button
                        variant="text"
                        onClick={() => setAreaSite(site)}
                        aria-label={`Manage attendance area for ${site.name}`}
                      >
                        Manage attendance area
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => setQrSite(site)}
                        aria-label={'Attendance QR for ' + site.name}
                      >
                        Store attendance QR
                      </Button>
                    </div>
                    <Button
                      variant="text"
                      aria-label={`Edit site ${site.name}`}
                      onClick={() => edit('site', site)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Edit
                    </Button>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Start with a site"
                description="Add your first office or work location. You can then assign people and create shifts."
              />
            )}
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <h2>Departments</h2>
                <p>Keep your teams organized across sites.</p>
              </div>
              <Button variant="secondary" onClick={() => edit('department')}>
                <Plus size={17} aria-hidden="true" />
                Add department
              </Button>
            </div>
            {data.departments.length ? (
              <ul className="workforce-departments">
                {data.departments.map((department) => (
                  <li key={department.id}>
                    <Layers3 size={20} aria-hidden="true" />
                    <strong>{department.name}</strong>
                    <Button
                      variant="text"
                      aria-label={`Edit department ${department.name}`}
                      onClick={() => edit('department', department)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Edit
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Bring your teams together"
                description="Add departments such as Operations or Administration before onboarding employees."
              />
            )}
          </Card>
          <Card>
            <div className="card-heading">
              <div>
                <h2>Shift templates</h2>
                <p>Define schedules in each site’s local time.</p>
              </div>
              <Button
                variant="secondary"
                disabled={!data.sites.some((site) => site.active)}
                onClick={() => edit('shift')}
              >
                <CalendarDays size={17} aria-hidden="true" />
                Add shift
              </Button>
            </div>
            <DataTable
              caption="Organization shift templates"
              rows={data.shifts}
              emptyTitle="Your schedules start here"
              emptyDescription="Add a site, then create a shift template. These templates do not clock anyone in or assign a working day."
              columns={[
                { key: 'name', label: 'Shift', render: (row) => <strong>{row.name}</strong> },
                { key: 'site_name', label: 'Site' },
                {
                  key: 'schedule',
                  label: 'Hours',
                  render: (row) => (
                    <span>
                      {row.starts_at.slice(0, 5)}–{row.ends_at.slice(0, 5)}{' '}
                      {row.ends_at < row.starts_at && (
                        <StatusBadge tone="neutral">Next day</StatusBadge>
                      )}
                    </span>
                  ),
                },
                { key: 'timezone', label: 'Time zone' },
                {
                  key: 'edit',
                  label: 'Action',
                  render: (row) => (
                    <Button
                      variant="text"
                      aria-label={`Edit shift ${row.name}`}
                      onClick={() => edit('shift', row)}
                    >
                      Edit
                    </Button>
                  ),
                },
              ]}
            />
          </Card>
          {editor && (
            <SetupForm
              {...editor}
              organization={data}
              onClose={() => setEditor(null)}
              onSaved={(message) => {
                setEditor(null);
                setNotice(message);
                reload();
              }}
            />
          )}
          {areaSite && (
            <StoreAreaEditor
              site={areaSite}
              onClose={() => setAreaSite(null)}
              onSaved={(message) => {
                setAreaSite(null);
                setNotice(message);
                reload();
              }}
            />
          )}
          {qrSite && <StoreAttendanceQr site={qrSite} onClose={() => setQrSite(null)} />}
        </>
      )}
    </>
  );
}
