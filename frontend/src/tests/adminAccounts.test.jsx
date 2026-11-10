import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import EmployeeForm from '../features/workforce/EmployeeForm';
import ManageAccountForm from '../features/workforce/ManageAccountForm';
import PendingAccounts from '../features/workforce/PendingAccounts';
import {
  createStaffAccount,
  updateStaffAccount,
  recoverStaffAccount,
} from '../services/adminAccountService';
import {
  loadPendingAccounts,
  closePendingAccount,
  saveEmployee,
} from '../services/workforceService';

vi.mock('../services/adminAccountService', () => ({
  createStaffAccount: vi.fn(),
  updateStaffAccount: vi.fn(),
  recoverStaffAccount: vi.fn(),
}));
vi.mock('../services/workforceService', () => ({
  loadPendingAccounts: vi.fn(),
  closePendingAccount: vi.fn(),
  saveEmployee: vi.fn(),
}));
const organization = {
  sites: [{ id: 'site', name: 'Main office', active: true }],
  departments: [{ id: 'department', name: 'Operations' }],
};
const person = {
  id: 'profile',
  email: 'current@example.invalid',
  display_name: 'Team Person',
  version: 2,
  membership_version: 1,
};
beforeEach(() => {
  createStaffAccount.mockResolvedValue({ status: 'completed', employee_id: 'profile' });
  updateStaffAccount.mockResolvedValue({ status: 'completed', employee_id: 'profile' });
  recoverStaffAccount.mockResolvedValue({ status: 'completed', employee_id: 'profile' });
  loadPendingAccounts.mockResolvedValue([]);
  saveEmployee.mockResolvedValue('profile');
});
async function fillEmployee(user) {
  await user.type(screen.getByLabelText('Account email'), 'new@example.invalid');
  await user.type(screen.getByLabelText('Initial password'), 'Synthetic-Password-17');
  await user.type(screen.getByLabelText('Full name'), 'New Person');
  await user.type(screen.getByLabelText('Employee number'), 'TEST-1');
  await user.selectOptions(screen.getByLabelText('Site', { exact: true }), 'site');
  await user.selectOptions(screen.getByLabelText('Department', { exact: true }), 'department');
}
it('creates the account and profile in one dashboard form without Supabase instructions', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  render(<EmployeeForm organization={organization} onClose={vi.fn()} onSaved={onSaved} />);
  expect(screen.queryByText(/Supabase Authentication/)).not.toBeInTheDocument();
  await fillEmployee(user);
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(createStaffAccount).toHaveBeenCalledWith(
    expect.objectContaining({
      display_name: 'New Person',
      email: 'new@example.invalid',
      password: 'Synthetic-Password-17',
      role: 'employee',
    }),
    expect.any(String),
    'create',
  );
  expect(saveEmployee).not.toHaveBeenCalled();
});
it.each(['create', 'existing'])(
  'requires an employee name before %s account setup',
  async (mode) => {
    const user = userEvent.setup();
    render(<EmployeeForm organization={organization} onClose={vi.fn()} onSaved={vi.fn()} />);
    await fillEmployee(user);
    await user.selectOptions(screen.getByLabelText('Account setup'), mode);
    const name = screen.getByLabelText('Full name');
    expect(name).toBeRequired();
    expect(
      name.compareDocumentPosition(screen.getByLabelText('Account email')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.clear(name);
    await user.type(name, '   ');
    await user.click(
      screen.getByRole('button', { name: mode === 'create' ? 'Create employee' : 'Link employee' }),
    );
    expect(name).toBeInvalid();
    expect(createStaffAccount).not.toHaveBeenCalled();
  },
);
it('links an existing account through the same server flow without requiring its password', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  render(<EmployeeForm organization={organization} onClose={vi.fn()} onSaved={onSaved} />);
  await user.selectOptions(screen.getByLabelText('Account setup'), 'existing');
  expect(screen.getByLabelText('New password')).not.toBeRequired();
  await user.type(screen.getByLabelText('Account email'), 'legacy@example.invalid');
  await user.type(screen.getByLabelText('Full name'), 'Legacy Person');
  await user.type(screen.getByLabelText('Employee number'), 'OLD-1');
  await user.selectOptions(screen.getByLabelText('Site', { exact: true }), 'site');
  await user.selectOptions(screen.getByLabelText('Department', { exact: true }), 'department');
  await user.click(screen.getByRole('button', { name: 'Link employee' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(createStaffAccount).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'legacy@example.invalid' }),
    expect.any(String),
    'existing',
  );
});
it('edits an existing employee name, keeps the typed value after a failed save and submits the replacement', async () => {
  const user = userEvent.setup();
  const record = {
    ...person,
    employee_number: 'SNR-1',
    site_id: 'site',
    department_id: 'department',
    role: 'employee',
    active: true,
  };
  const onSaved = vi.fn();
  const props = { record, organization, onClose: vi.fn(), onSaved };
  const view = render(<EmployeeForm {...props} />);
  const name = screen.getByLabelText('Full name');
  expect(name).toBeEnabled();
  expect(name).not.toHaveAttribute('readonly');
  expect(name).toHaveValue('Team Person');
  expect(screen.getByLabelText('Account email')).toHaveAttribute('readonly');
  await user.clear(name);
  await user.type(name, 'Mary Kamal');
  // An unrelated parent render must not replace the edit with the old record value.
  view.rerender(<EmployeeForm {...props} record={{ ...record }} />);
  expect(name).toHaveValue('Mary Kamal');
  saveEmployee.mockRejectedValueOnce(new Error('The connection failed. Try saving again.'));
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('connection failed');
  expect(name).toHaveValue('Mary Kamal');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Employee changes saved.'));
  expect(saveEmployee).toHaveBeenLastCalledWith(
    expect.objectContaining({ display_name: 'Mary Kamal', email: person.email }),
    record,
  );
  expect(createStaffAccount).not.toHaveBeenCalled();
});
it('checks an interrupted account setup instead of creating another account', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  createStaffAccount.mockRejectedValue(
    Object.assign(new Error('Check the pending request.'), { operationId: 'pending-operation' }),
  );
  render(<EmployeeForm organization={organization} onClose={vi.fn()} onSaved={onSaved} />);
  await fillEmployee(user);
  await user.click(screen.getByRole('button', { name: 'Create employee' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('pending request');
  expect(screen.getByLabelText('Account email')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check account setup' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(createStaffAccount).toHaveBeenCalledTimes(1);
  expect(recoverStaffAccount).toHaveBeenCalledWith('pending-operation');
});
it('manages email and password with reserved versions and refreshes the snapshot after a definite rejection', async () => {
  const user = userEvent.setup();
  const onSaved = vi.fn();
  updateStaffAccount.mockRejectedValueOnce(
    Object.assign(new Error('Choose a stronger password.'), {
      operationClosed: true,
      profileVersion: 3,
      membershipVersion: 1,
    }),
  );
  render(<ManageAccountForm record={person} onClose={vi.fn()} onSaved={onSaved} />);
  await user.clear(screen.getByLabelText('Sign-in email'));
  await user.type(screen.getByLabelText('Sign-in email'), 'changed@example.invalid');
  await user.type(screen.getByLabelText('New password'), 'Synthetic-Password-17');
  await user.click(screen.getByRole('button', { name: 'Save login details' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('stronger password');
  await user.click(screen.getByRole('button', { name: 'Save login details' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(updateStaffAccount).toHaveBeenLastCalledWith(
    expect.objectContaining({ version: 3 }),
    expect.objectContaining({ email: 'changed@example.invalid' }),
    expect.any(String),
  );
  expect(updateStaffAccount.mock.calls[0][2]).not.toBe(updateStaffAccount.mock.calls[1][2]);
});
it('provides interrupted request recovery within the directory', async () => {
  const user = userEvent.setup();
  const onResolved = vi.fn();
  loadPendingAccounts
    .mockResolvedValueOnce([
      {
        id: 'pending-operation',
        email: 'pending@example.invalid',
        action: 'create',
        can_close: true,
      },
    ])
    .mockResolvedValue([]);
  render(<PendingAccounts onResolved={onResolved} />);
  const card = within(
    await screen
      .findByRole('heading', { name: 'Pending account requests' })
      .then((heading) => heading.closest('section')),
  );
  await user.click(
    card.getByRole('button', { name: 'Check account request pending@example.invalid' }),
  );
  expect(await screen.findByText('Account request completed.')).toBeVisible();
  expect(onResolved).toHaveBeenCalledOnce();
  expect(closePendingAccount).not.toHaveBeenCalled();
});
