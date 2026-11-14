import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../app/App';
import AppRoutes from '../app/routes';
import { AuthContext } from '../hooks/useAuth';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';

function open(path, auth = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider
        value={{
          session: null,
          loading: false,
          signIn: vi.fn().mockRejectedValue(new Error('Sign-in is not available yet.')),
          signOut: vi.fn(),
          ...auth,
        }}
      >
        <AppRoutes />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('Public website and application startup', () => {
  it('starts the application and gives visitors useful sign-in and feature navigation', async () => {
    window.history.replaceState({}, '', '/');
    render(<App />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /Workforce Management, Made Simple\./i,
      }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: /Explore Features/ })).toHaveAttribute(
      'href',
      '#features',
    );
    expect(screen.getByRole('heading', { name: 'Attendance Tracking' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    const user = userEvent.setup();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: /Sign In/,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Good to see you.' })).toBeVisible();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  });

  it('opens and closes mobile navigation, including Escape and link activation', async () => {
    open('/');
    const user = userEvent.setup();
    const toggle = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: 'Features',
      }),
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows a useful noindex page for unknown routes', () => {
    open('/does-not-exist');
    expect(screen.getByRole('heading', { name: 'Let’s get you back.' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/');
  });
});

describe('Login and authorization boundaries', () => {
  it('validates email/password and toggles password visibility without signing in', async () => {
    const signIn = vi.fn();
    open('/login', { signIn });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(screen.getByText('Enter a valid email address.')).toBeVisible();
    expect(screen.getByLabelText('Email address')).toHaveFocus();
    expect(screen.getByText('Enter your password.')).toBeVisible();
    await user.type(screen.getByLabelText('Password'), 'sample-password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(signIn).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('reports unavailable authentication and never opens a fake session', async () => {
    open('/login');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email address'), 'person@example.invalid');
    await user.type(screen.getByLabelText('Password'), 'sample-password');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is not available yet.');
    expect(screen.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
  });

  it.each(['/me', '/team', '/hr', '/me/documents', '/hr/approvals'])(
    'protects %s without a session',
    async (path) => {
      open(path);
      expect(await screen.findByRole('heading', { name: 'Good to see you.' })).toBeVisible();
      expect(screen.queryByText('Design preview')).not.toBeInTheDocument();
    },
  );

  it('denies another role even when a user is authenticated', () => {
    open('/hr', {
      session: { user_id: 'user', organization_id: 'org', role: 'employee', workspace: '/me' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('This workspace isn’t assigned to you');
    expect(screen.queryByRole('heading', { name: /People first/ })).not.toBeInTheDocument();
  });
});

describe('Development sample workspaces', () => {
  it('records a sample workday and treats clocked out as completion', async () => {
    open('/preview/me');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: 'A fresh start, Alex.' })).toBeVisible();
    expect(screen.getByText(/Synthetic data/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clock In' }));
    expect(screen.getByText('Clocked in')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Clock Out' }));
    expect(screen.getByRole('button', { name: 'Day complete' })).toBeDisabled();
    expect(screen.getByText('Clocked out')).toHaveClass('status-neutral');
    expect(screen.getByRole('status')).toHaveTextContent('Sample clock-out recorded');
  });

  it('submits a correction with a reason and keeps it in the employee queue', async () => {
    open('/preview/me/corrections');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Request Correction' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Attendance date'), '2026-11-04');
    await user.type(within(dialog).getByLabelText('Correct time'), '09:00');
    await user.type(
      within(dialog).getByLabelText('Reason'),
      'The clock-in screen did not respond.',
    );
    await user.click(within(dialog).getByRole('button', { name: /Submit Request/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('2 pending')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Sample request submitted');
  });

  it('lets supervisors recommend but never finally approve', async () => {
    open('/preview/team/corrections');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Review request CR-104/ }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('button', { name: 'Approve Request' }),
    ).not.toBeInTheDocument();
    await user.type(
      within(dialog).getByLabelText('Review note'),
      'Arrival confirmed with the team.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Recommend Request' }));
    await user.click(screen.getByRole('button', { name: /Review request CR-104/ }));
    expect(screen.getByText('Recommended')).toBeVisible();
    expect(within(screen.getByRole('dialog')).getByText('Pending')).toBeVisible();
  });

  it.each([
    ['Approve Request', 'Approved'],
    ['Reject Request', 'Rejected'],
  ])('lets HR %s locally with a review note', async (action, status) => {
    open('/preview/hr/approvals');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Review request CR-104/ }));
    await user.type(
      screen.getByLabelText('Review note'),
      'Evidence reviewed for this sample request.',
    );
    await user.click(screen.getByRole('button', { name: action }));
    expect(screen.getByText(status)).toBeVisible();
    expect(screen.getByText('2 pending')).toBeVisible();
  });

  it('searches and filters the HR directory, including its empty state', async () => {
    open('/preview/hr/employees');
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', { name: 'Search employees' });
    await user.type(search, 'Kavya');
    expect(screen.getByText('Kavya Nair')).toBeVisible();
    expect(screen.queryByText('Arjun Mehta')).not.toBeInTheDocument();
    await user.clear(search);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filter by department' }),
      'Engineering',
    );
    expect(screen.getByText('Dev Reddy')).toBeVisible();
    expect(screen.queryByText('Kavya Nair')).not.toBeInTheDocument();
    await user.type(search, 'no-such-person');
    expect(screen.getByRole('heading', { name: 'No matching records' })).toBeVisible();
  });

  it.each([
    ['/preview/me', 'Employee navigation', 'My Attendance', 'Approvals'],
    ['/preview/team', 'Supervisor navigation', 'Team Attendance', 'Employees'],
    ['/preview/hr', 'HR / Admin navigation', 'Employees', 'My Attendance'],
  ])('gives %s a distinct role navigation', async (path, name, allowed, denied) => {
    open(path);
    const nav = await screen.findByRole('navigation', { name });
    expect(within(nav).getByRole('link', { name: allowed })).toBeVisible();
    expect(within(nav).getByRole('link', { name: 'Attendance QR', exact: true })).toHaveAttribute(
      'href',
      path + '/attendance-qr',
    );
    expect(within(nav).queryByRole('link', { name: denied })).not.toBeInTheDocument();
  });
});

it('provides helpful error, loading and empty states', async () => {
  const retry = vi.fn();
  render(
    <>
      <ErrorState onRetry={retry} />
      <EmptyState
        title="No documents yet"
        description="Your approved documents will appear here."
      />
      <LoadingState />
    </>,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(screen.getByText('Your approved documents will appear here.')).toBeVisible();
});
