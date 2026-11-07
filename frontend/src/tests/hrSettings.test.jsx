import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../hooks/useAuth';
import HrSettings from '../features/workforce/HrSettings';
import { loadWorkspaceSettings, saveWorkspaceSettings } from '../services/workforceService';
import { updateOwnLogin } from '../services/adminAccountService';
vi.mock('../services/workforceService', () => ({
  loadWorkspaceSettings: vi.fn(),
  saveWorkspaceSettings: vi.fn(),
}));
vi.mock('../services/adminAccountService', () => ({ updateOwnLogin: vi.fn() }));
const refreshSession = vi.fn();
beforeEach(() => {
  loadWorkspaceSettings.mockResolvedValue({
    name: 'Organization',
    timezone: 'Asia/Kolkata',
    version: 3,
    display_name: 'HR Person',
  });
  saveWorkspaceSettings.mockResolvedValue({
    name: 'Renamed organization',
    timezone: 'Asia/Kolkata',
    version: 4,
    display_name: 'HR Person',
  });
  refreshSession.mockResolvedValue();
  updateOwnLogin.mockResolvedValue({ emailPending: true });
});
function mount() {
  render(
    <AuthContext.Provider
      value={{
        session: { display_name: 'HR Person', email: 'hr@example.invalid' },
        refreshSession,
      }}
    >
      <HrSettings />
    </AuthContext.Provider>,
  );
}
it('saves versioned organization preferences and the admin name in the dashboard', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(await screen.findByRole('button', { name: 'Edit workspace' }));
  await user.clear(screen.getByLabelText('Organization name'));
  await user.type(screen.getByLabelText('Organization name'), 'Renamed organization');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText('Workspace settings saved.')).toBeVisible();
  expect(saveWorkspaceSettings).toHaveBeenCalledWith(
    { name: 'Renamed organization', timezone: 'Asia/Kolkata', display_name: 'HR Person' },
    3,
  );
  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
});
it('starts the admin’s own email change from Settings without pretending it is already confirmed', async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole('button', { name: 'Change my login details' }));
  await user.clear(screen.getByLabelText('Your sign-in email'));
  await user.type(screen.getByLabelText('Your sign-in email'), 'new-hr@example.invalid');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByText(/Check your inbox to confirm/)).toBeVisible();
  expect(updateOwnLogin).toHaveBeenCalledWith({ email: 'new-hr@example.invalid', password: '' });
});
