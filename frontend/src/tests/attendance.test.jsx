import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PunchCard from '../features/attendance/PunchCard';
import AttendanceRecords from '../features/attendance/AttendanceRecords';
import EmployeeSchedule from '../features/attendance/EmployeeSchedule';
import {
  loadAttendanceRecords,
  loadAttendanceWorkspace,
  recordAttendance,
} from '../services/attendanceService';
import {
  dateLabel,
  durationLabel,
  earlierDate,
  momentLabel,
} from '../features/attendance/attendanceFormat';
vi.mock('../services/attendanceService', () => ({
  loadAttendanceRecords: vi.fn(),
  loadAttendanceWorkspace: vi.fn(),
  recordAttendance: vi.fn(),
}));
const workspace = {
  today: '2026-11-07',
  timezone: 'Asia/Kolkata',
  site_name: 'Main office',
  site_active: true,
  status: 'clocked_out',
  last_event_id: 'previous',
  sites: [],
  departments: [],
  shift: {
    name: 'Day shift',
    work_date: '2026-11-07',
    timezone: 'Asia/Kolkata',
    scheduled_start: '2026-11-07T03:30:00Z',
    scheduled_end: '2026-11-07T11:30:00Z',
  },
};
const receipt = { id: 'new-event', event_type: 'clock_in', occurred_at: '2026-11-07T04:00:00Z' };
beforeEach(() => {
  loadAttendanceWorkspace.mockResolvedValue({ ...workspace, role: 'employee', schedule: [] });
  recordAttendance.mockResolvedValue(receipt);
  loadAttendanceRecords.mockResolvedValue({
    rows: [],
    total: 0,
    page: 1,
    page_size: 20,
    summary: { sessions: 0, open: 0, completed_seconds: 0 },
  });
});

it('handles a changed database role without rendering an employee schedule from stale navigation', async () => {
  loadAttendanceWorkspace.mockResolvedValue({ role: 'supervisor', sites: [], departments: [] });
  render(<EmployeeSchedule />);
  expect(await screen.findByText('Your workspace access changed')).toBeVisible();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
it('blocks clock-in until a shift is assigned but permits finishing an open session at an inactive site', async () => {
  const view = render(
    <PunchCard
      workspace={{ ...workspace, shift: null }}
      onRecorded={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Clock in' })).toBeDisabled();
  expect(screen.getByText('Ask HR to assign your shift before clocking in.')).toBeVisible();
  view.rerender(
    <PunchCard
      workspace={{
        ...workspace,
        site_active: false,
        status: 'clocked_in',
        open_since: '2026-11-06T17:30:00Z',
      }}
      onRecorded={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Clock out' })).toBeEnabled();
});
it('recovers an uncertain punch with the original request and snapshot, without toggling the action', async () => {
  recordAttendance.mockRejectedValueOnce(
    Object.assign(new Error('Response lost'), { retryable: true }),
  );
  const saved = vi.fn();
  const refresh = vi.fn();
  const user = userEvent.setup();
  render(<PunchCard workspace={workspace} onRecorded={saved} onRefresh={refresh} />);
  await user.click(screen.getByRole('button', { name: 'Clock in' }));
  expect(await screen.findByRole('button', { name: 'Check attendance request' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check attendance request' }));
  expect(recordAttendance.mock.calls[0][0]).toEqual(recordAttendance.mock.calls[1][0]);
  expect(recordAttendance.mock.calls[0][0]).toMatchObject({
    type: 'clock_in',
    previousId: 'previous',
  });
  expect(saved).toHaveBeenCalledOnce();
  expect(refresh).not.toHaveBeenCalled();
});
it('does not treat a malformed receipt as a confirmed punch or issue a second action while saving', async () => {
  let resolve;
  recordAttendance.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const saved = vi.fn();
  const user = userEvent.setup();
  render(<PunchCard workspace={workspace} onRecorded={saved} onRefresh={vi.fn()} />);
  await user.dblClick(screen.getByRole('button', { name: 'Clock in' }));
  expect(recordAttendance).toHaveBeenCalledOnce();
  resolve({ status: 'unexpected' });
  expect(await screen.findByRole('button', { name: 'Check attendance request' })).toBeVisible();
  expect(saved).not.toHaveBeenCalled();
});
it('keeps attendance filtering explicit and rejects a range longer than 31 days', async () => {
  const user = userEvent.setup();
  render(<AttendanceRecords workspace={workspace} own />);
  await waitFor(() => expect(loadAttendanceRecords).toHaveBeenCalledOnce());
  await user.clear(screen.getByLabelText('From date'));
  await user.type(screen.getByLabelText('From date'), '2026-09-01');
  await user.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('up to 31 days');
  expect(loadAttendanceRecords).toHaveBeenCalledOnce();
});
it('formats work dates independently of browser time zones and preserves open-session status', () => {
  expect(earlierDate('2026-03-01', 1)).toBe('2026-02-28');
  expect(dateLabel('2026-11-07')).toContain('7 Nov 2026');
  expect(momentLabel('2026-11-06T23:30:00Z', 'Asia/Kolkata')).toContain('7 Nov');
  expect(durationLabel(null)).toBe('In progress');
  expect(durationLabel(7200)).toBe('2 h 0 min');
});
