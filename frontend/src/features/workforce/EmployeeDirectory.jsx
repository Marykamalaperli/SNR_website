import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import PageHeader from '../../components/dashboard/PageHeader';
import DataTable from '../../components/dashboard/DataTable';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { ErrorState, LoadingState } from '../../components/common/States';
import FormField from '../../components/forms/FormField';
import useRemoteData from '../../hooks/useRemoteData';
import { loadDirectory, loadOrganization } from '../../services/workforceService';
import EmployeeForm from './EmployeeForm';
import ManageAccountForm from './ManageAccountForm';
import PendingAccounts from './PendingAccounts';
import EmployeeShifts from './EmployeeShifts';
import EmployeeSecurity from './EmployeeSecurity';

const initialFilters = { search: '', site: '', department: '', status: 'active', page: 1 };
const roleNames = { employee: 'Employee', supervisor: 'Supervisor', hr: 'HR' };

export default function EmployeeDirectory({ manage = false }) {
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const [accountEditor, setAccountEditor] = useState(null);
  const [shiftEditor, setShiftEditor] = useState(null);
  const [securityEditor, setSecurityEditor] = useState(null);
  const [notice, setNotice] = useState('');
  const [accountRevision, setAccountRevision] = useState(0);
  const fetchDirectory = useCallback(() => loadDirectory(filters), [filters]);
  const fetchOrganization = useCallback(
    () => (manage ? loadOrganization() : Promise.resolve(null)),
    [manage],
  );
  const directory = useRemoteData(fetchDirectory);
  const organization = useRemoteData(fetchOrganization);
  const canAdd =
    organization.data?.sites.some((site) => site.active) &&
    organization.data?.departments.length > 0;
  const change = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  const filtered =
    filters.search || filters.site || filters.department || filters.status !== 'active';
  const columns = [
    {
      key: 'display_name',
      label: 'Person',
      render: (row) => (
        <div className="directory-person">
          <span className="directory-avatar" aria-hidden="true">
            {row.display_name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')}
          </span>
          <div>
            <strong>{row.display_name}</strong>
            <small>{row.employee_number}</small>
          </div>
        </div>
      ),
    },
    { key: 'department_name', label: 'Department' },
    { key: 'site_name', label: 'Site' },
    { key: 'role', label: 'Workspace', render: (row) => roleNames[row.role] || 'Assigned account' },
    {
      key: 'active',
      label: 'Account access',
      render: (row) => (
        <StatusBadge tone={row.active ? 'positive' : 'neutral'}>
          {row.active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
  ];
  if (manage)
    columns.push({
      key: 'edit',
      label: 'Action',
      render: (row) =>
        ['employee', 'supervisor'].includes(row.role) ? (
          <div className="directory-actions">
            <Button
              variant="text"
              disabled={!organization.data}
              aria-label={`Edit employee ${row.display_name}`}
              onClick={() => setEditor({ record: row })}
            >
              Edit profile
            </Button>
            <Button
              variant="text"
              aria-label={`Manage account ${row.display_name}`}
              onClick={() => setAccountEditor(row)}
            >
              Manage account
            </Button>
            {row.role === 'employee' && row.active && (
              <Button
                variant="text"
                aria-label={`Attendance security ${row.display_name}`}
                onClick={() => setSecurityEditor(row)}
              >
                Attendance security
              </Button>
            )}
            {row.role === 'employee' && row.active && (
              <Button
                variant="text"
                aria-label={`Manage shifts ${row.display_name}`}
                onClick={() => setShiftEditor(row)}
              >
                Manage shifts
              </Button>
            )}
          </div>
        ) : (
          <span className="muted">Managed separately</span>
        ),
    });
  return (
    <>
      <PageHeader
        eyebrow={manage ? 'PEOPLE, ORGANIZED' : 'YOUR ASSIGNED TEAM'}
        title={manage ? 'Employee directory' : 'Team members'}
        description={
          manage
            ? 'The people, places and teams that make your organization.'
            : 'Employee profiles for your assigned departments and work sites.'
        }
        action={
          manage && (
            <div className="directory-actions">
              <Button
                href="/attendance/qr"
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
              >
                Open attendance QR
              </Button>
              <Button disabled={!canAdd} onClick={() => setEditor({ record: null })}>
                <Plus size={17} aria-hidden="true" />
                Add employee
              </Button>
            </div>
          )
        }
      />
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {manage && (
        <PendingAccounts
          key={accountRevision}
          onResolved={() => {
            directory.reload();
          }}
        />
      )}
      {manage && organization.error && (
        <Card>
          <ErrorState
            title="Employee setup could not be loaded"
            description={organization.error}
            onRetry={organization.reload}
          />
        </Card>
      )}
      {manage && organization.data && !canAdd && (
        <p className="notice">
          Add a site and department before your first employee.
          <Link className="text-link" to="/hr/sites">
            Open organization setup
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </p>
      )}
      <Card className="directory-card">
        <div className="card-heading">
          <div>
            <h2>{manage ? 'Employee records' : 'Your team’s profiles'}</h2>
            <p>Account access and workplace assignments.</p>
          </div>
          {directory.data && (
            <span className="count-label">
              {directory.data.total} {directory.data.total === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
        <form
          className="directory-filters"
          onSubmit={(event) => {
            event.preventDefault();
            change('search', search.trim());
          }}
        >
          <FormField label="Search people" id="directory-search">
            {(attributes) => (
              <div className="directory-search">
                <Search size={18} aria-hidden="true" />
                <input
                  {...attributes}
                  value={search}
                  maxLength={80}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or employee number"
                  type="search"
                />
              </div>
            )}
          </FormField>
          {manage && (
            <>
              <FormField label="Site" id="directory-site">
                {(attributes) => (
                  <select
                    {...attributes}
                    value={filters.site}
                    onChange={(event) => change('site', event.target.value)}
                  >
                    <option value="">All sites</option>
                    {organization.data?.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Department" id="directory-department">
                {(attributes) => (
                  <select
                    {...attributes}
                    value={filters.department}
                    onChange={(event) => change('department', event.target.value)}
                  >
                    <option value="">All departments</option>
                    {organization.data?.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Access" id="directory-status">
                {(attributes) => (
                  <select
                    {...attributes}
                    value={filters.status}
                    onChange={(event) => change('status', event.target.value)}
                  >
                    <option value="active">Active accounts</option>
                    <option value="inactive">Inactive accounts</option>
                    <option value="all">All accounts</option>
                  </select>
                )}
              </FormField>
            </>
          )}
          <Button type="submit" variant="secondary">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Search
          </Button>
          {filtered && (
            <Button
              variant="text"
              onClick={() => {
                setFilters(initialFilters);
                setSearch('');
              }}
            >
              Clear filters
            </Button>
          )}
        </form>
        {directory.loading ? (
          <LoadingState label="Loading employee records…" />
        ) : directory.error ? (
          <ErrorState
            title="Employee records could not be loaded"
            description={directory.error}
            onRetry={directory.reload}
          />
        ) : (
          <>
            {directory.data.rows.length > 0 && (
              <p className="directory-table-hint">
                Swipe across the table for more details and actions.
              </p>
            )}
            <DataTable
              caption={manage ? 'Employee directory' : 'Assigned team members'}
              rows={directory.data.rows}
              columns={columns}
              emptyTitle={
                filtered
                  ? 'No people match these filters'
                  : manage
                    ? 'Your team starts here'
                    : 'No team members assigned yet'
              }
              emptyDescription={
                filtered
                  ? 'Try a different name, employee number or filter.'
                  : manage
                    ? 'Create the person’s login account and employee profile here.'
                    : 'Ask HR to review your department and site assignments.'
              }
            />
            {directory.data.total > 0 && (
              <div className="directory-pagination">
                <p role="status">
                  {directory.data.rows.length
                    ? (filters.page - 1) * directory.data.page_size + 1
                    : 0}
                  –{Math.min(filters.page * directory.data.page_size, directory.data.total)} of{' '}
                  {directory.data.total} people
                </p>
                <div>
                  <Button
                    variant="secondary"
                    disabled={filters.page === 1}
                    aria-label="Previous page"
                    onClick={() =>
                      setFilters((current) => ({ ...current, page: current.page - 1 }))
                    }
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={filters.page * directory.data.page_size >= directory.data.total}
                    aria-label="Next page"
                    onClick={() =>
                      setFilters((current) => ({ ...current, page: current.page + 1 }))
                    }
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
      {editor && organization.data && (
        <EmployeeForm
          key={editor.record?.id || 'new-employee'}
          record={editor.record}
          organization={organization.data}
          onClose={() => {
            setEditor(null);
            setAccountRevision((value) => value + 1);
            directory.reload();
          }}
          onSaved={(message) => {
            setEditor(null);
            setAccountRevision((value) => value + 1);
            setNotice(message);
            directory.reload();
          }}
        />
      )}
      {accountEditor && (
        <ManageAccountForm
          record={accountEditor}
          onClose={() => {
            setAccountEditor(null);
            setAccountRevision((value) => value + 1);
            directory.reload();
          }}
          onSaved={(message) => {
            setAccountEditor(null);
            setAccountRevision((value) => value + 1);
            setNotice(message);
            directory.reload();
          }}
        />
      )}
      {securityEditor && (
        <EmployeeSecurity record={securityEditor} onClose={() => setSecurityEditor(null)} />
      )}
      {shiftEditor && (
        <EmployeeShifts
          record={shiftEditor}
          onClose={() => {
            setShiftEditor(null);
            directory.reload();
          }}
        />
      )}
    </>
  );
}
