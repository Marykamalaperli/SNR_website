import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import EmployeeDirectory from '../features/workforce/EmployeeDirectory';
import OrganizationSetup from '../features/workforce/OrganizationSetup';
import {
  loadDirectory,
  loadPendingAccounts,
  loadOrganization,
  saveEmployee,
  saveOrganizationRecord,
  loadStoreArea,
  saveStoreArea,
  saveAttendanceSite,
} from '../services/workforceService';
import useRemoteData from '../hooks/useRemoteData';

vi.mock('../services/workforceService', () => ({
  loadDirectory: vi.fn(),
  loadPendingAccounts: vi.fn(),
  closePendingAccount: vi.fn(),
  loadOrganization: vi.fn(),
  saveEmployee: vi.fn(),
  saveOrganizationRecord: vi.fn(),
  loadStoreArea: vi.fn(),
  saveStoreArea: vi.fn(),
  saveAttendanceSite: vi.fn(),
  resolveStoreMapLink: vi.fn(),
}));
const organization = {
  organization: { name: 'Test organization', timezone: 'Asia/Kolkata' },
  sites: [{ id: 'site', name: 'Main office', timezone: 'Asia/Kolkata', active: true, version: 1 }],
  departments: [{ id: 'department', name: 'Operations', version: 1 }],
  shifts: [],
};
const person = {
  id: 'profile',
  display_name: 'Verified employee',
  employee_number: 'SNR-1',
  department_name: 'Operations',
  site_name: 'Main office',
  role: 'employee',
  active: true,
  email: 'staff@example.invalid',
  site_id: 'site',
  department_id: 'department',
  version: 2,
  membership_version: 4,
};
beforeEach(() => {
  loadStoreArea.mockResolvedValue({
    site_id: 'site',
    site_name: 'Main office',
    configured: false,
    latitude: null,
    longitude: null,
    radius_meters: 50,
    version: null,
  });
  saveStoreArea.mockResolvedValue({ site_id: 'site', version: 1 });
  loadPendingAccounts.mockResolvedValue([]);
  loadOrganization.mockResolvedValue(organization);
  loadDirectory.mockResolvedValue({ rows: [person], total: 1, page: 1, page_size: 20 });
  saveEmployee.mockResolvedValue('profile');
  saveOrganizationRecord.mockResolvedValue('site');
  saveAttendanceSite.mockResolvedValue('site');
});
function mount(component) {
  return render(<MemoryRouter>{component}</MemoryRouter>);
}

it('configures a store area in the dashboard with real coordinates and a versioned radius', async () => {
  const user = userEvent.setup();
  mount(<OrganizationSetup />);
  await user.click(
    await screen.findByRole('button', { name: 'Manage attendance area for Main office' }),
  );
  const dialog = within(screen.getByRole('dialog'));
  const latitude = await dialog.findByLabelText('Store latitude');
  expect(latitude).toHaveValue(null);
  await user.type(latitude, '12.971599');
  await user.type(dialog.getByLabelText('Store longitude'), '77.594566');
  expect(dialog.getByText(/Attendance radius: 50 metres/)).toBeVisible();
  await user.click(dialog.getByRole('button', { name: 'Save attendance area' }));
  await waitFor(() =>
    expect(saveStoreArea).toHaveBeenCalledWith(
      expect.objectContaining({ version: null, site_id: 'site' }),
      { latitude: '12.971599', longitude: '77.594566', radius_meters: '50', map_url: '' },
    ),
  );
  expect(await screen.findByText(/Store attendance area saved/)).toBeVisible();
});

it('keeps a stale store-area edit visible for review without claiming success', async () => {
  const user = userEvent.setup();
  loadStoreArea.mockResolvedValue({
    site_id: 'site',
    site_name: 'Main office',
    configured: true,
    latitude: 12.971599,
    longitude: 77.594566,
    radius_meters: 50,
    version: 3,
  });
  saveStoreArea.mockRejectedValueOnce(new Error('This record changed while you were editing.'));
  mount(<OrganizationSetup />);
  await user.click(
    await screen.findByRole('button', { name: 'Manage attendance area for Main office' }),
  );
  const dialog = within(screen.getByRole('dialog'));
  await user.click(await dialog.findByRole('button', { name: 'Save attendance area' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('changed while you were editing');
  expect(saveStoreArea.mock.calls[0][0].version).toBe(3);
});

it('searches and filters the real directory, resets paging, and renders server failures', async () => {
  const user = userEvent.setup();
  loadDirectory.mockResolvedValue({ rows: [person], total: 23, page: 1, page_size: 20 });
  mount(<EmployeeDirectory manage />);
  expect(await screen.findByText('Verified employee')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  await waitFor(() =>
    expect(loadDirectory).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })),
  );
  await user.type(screen.getByLabelText('Search people'), 'SNR-1');
  await user.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await waitFor(() =>
    expect(loadDirectory).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'SNR-1', page: 1 }),
    ),
  );
  loadDirectory.mockRejectedValueOnce(new Error('Workspace access was revoked.'));
  await user.selectOptions(screen.getByLabelText('Site', { exact: true }), 'site');
  expect(await screen.findByRole('alert')).toHaveTextContent('Workspace access was revoked');
  expect(screen.queryByText('Verified employee')).not.toBeInTheDocument();
});

it('keeps employee edits open on conflicts and submits the versioned profile and access choice', async () => {
  const user = userEvent.setup();
  saveEmployee.mockRejectedValue(new Error('This record changed while you were editing.'));
  mount(<EmployeeDirectory manage />);
  await user.click(await screen.findByRole('button', { name: 'Edit employee Verified employee' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByLabelText('Account email')).toHaveAttribute('readonly');
  await user.selectOptions(dialog.getByLabelText('Account access'), 'false');
  await user.click(dialog.getByRole('button', { name: 'Save changes' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('changed while you were editing');
  expect(saveEmployee).toHaveBeenCalledWith(
    expect.objectContaining({ email: person.email, active: 'false' }),
    person,
  );
  expect(dialog.getByLabelText('Workspace role').querySelectorAll('option')).toHaveLength(2);
});

it('offers site/department setup before onboarding and no mutation controls to supervisors', async () => {
  loadOrganization.mockResolvedValue({ ...organization, sites: [], departments: [] });
  const view = mount(<EmployeeDirectory manage />);
  expect(await screen.findByRole('link', { name: /Open organization setup/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add employee' })).toBeDisabled();
  view.unmount();
  mount(<EmployeeDirectory />);
  expect(await screen.findByText('Verified employee')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /Add employee|Edit employee/ }),
  ).not.toBeInTheDocument();
});

it('saves site setup and prevents dismissal during an in-flight save', async () => {
  const user = userEvent.setup();
  let complete;
  saveAttendanceSite.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  mount(<OrganizationSetup />);
  await user.click(await screen.findByRole('button', { name: 'Add site', exact: true }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(await dialog.findByLabelText('Site name'), 'New office');
  await user.type(dialog.getByLabelText('Store latitude'), '12.971599');
  await user.type(dialog.getByLabelText('Store longitude'), '77.594566');
  await user.click(dialog.getByRole('button', { name: 'Add site', exact: true }));
  expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeDisabled();
  expect(dialog.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  expect(saveAttendanceSite).toHaveBeenCalledWith(
    {
      name: 'New office',
      timezone: 'Asia/Kolkata',
      latitude: '12.971599',
      longitude: '77.594566',
      radius_meters: '50',
      map_url: '',
    },
    null,
    { version: null },
  );
  await act(async () => complete('saved-site'));
  expect(await screen.findByText('Site saved.')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('ignores an old data request when a newer tenant/page loader replaces it', async () => {
  let finishOld;
  const oldLoader = () =>
    new Promise((resolve) => {
      finishOld = resolve;
    });
  const newLoader = vi.fn().mockResolvedValue('Current workspace');
  function Probe({ loader }) {
    const state = useRemoteData(loader);
    return <output>{state.loading ? 'Loading' : state.data}</output>;
  }
  const view = render(<Probe loader={oldLoader} />);
  await waitFor(() => expect(finishOld).toBeTypeOf('function'));
  view.rerender(<Probe loader={newLoader} />);
  expect(await screen.findByText('Current workspace')).toBeVisible();
  await act(async () => finishOld('Old tenant records'));
  expect(screen.getByText('Current workspace')).toBeVisible();
  expect(screen.queryByText('Old tenant records')).not.toBeInTheDocument();
});
