import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import PunchCard from '../features/attendance/PunchCard';
import AttendanceRecords from '../features/attendance/AttendanceRecords';
import EmployeeSchedule from '../features/attendance/EmployeeSchedule';
import AttendanceLocationDetails from '../features/attendance/AttendanceLocationDetails';
import { captureAttendanceLocation } from '../services/locationService';
import {
  loadAttendanceRecords,
  loadAttendanceWorkspace,
  loadAttendanceLocations,
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
  loadAttendanceLocations: vi.fn(),
  recordAttendance: vi.fn(),
  verifyAttendanceQr: vi.fn(),
  validateAttendanceLocation: vi.fn(),
}));
vi.mock('../services/locationService', () => ({
  captureAttendanceLocation: vi.fn(),
  LOCATION_NOTICE_VERSION: 'attendance-location-v1',
}));
const evidence = {
  qr: 'snr-attendance:v1:20000000-0000-4000-8000-000000000001:a0000000-0000-4000-8000-000000000001',
  photo: {
    jpeg_base64: '/9j/2Q==',
    captured_at: '2026-11-07T04:00:00Z',
    consent_version: 'attendance-photo-location-v1',
  },
};
vi.mock('../features/attendance/AttendanceCapture', () => ({
  default: ({ onConfirm, busy }) => (
    <button disabled={busy} onClick={() => onConfirm(evidence)}>
      Confirm capture
    </button>
  ),
}));
async function punch(user, name) {
  await user.click(screen.getByRole('button', { name, exact: true }));
  await user.click(screen.getByRole('button', { name: 'Confirm capture' }));
}
const workspace = {
  employee_id: 'employee',
  storage_required: true,
  camera_location_policy: 'location-before-camera-v1',
  evidence_required: true,
  evidence_notice_version: 'attendance-photo-location-v1',
  location_required: true,
  location_notice_version: 'attendance-location-v1',
  store_geofence_required: true,
  store_geofence_policy: 'store-radius-v1',
  attendance_area: { configured: true, radius_meters: 100, site_name: 'Main office' },
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
const point = {
  latitude: 12.971599,
  longitude: 77.594566,
  accuracy_meters: 8,
  captured_at: '2026-11-07T04:00:00Z',
  consent_version: 'attendance-location-v1',
};
const receipt = {
  id: 'new-event',
  event_type: 'clock_in',
  occurred_at: '2026-11-07T04:00:00Z',
  location_saved: true,
  storage_saved: true,
  photo_saved: true,
  qr_verified: true,
};
beforeEach(() => {
  evidence.photo.location_at_capture = point;
  loadAttendanceLocations.mockResolvedValue({ timezone: 'UTC', clock_in: null, clock_out: null });
  captureAttendanceLocation.mockResolvedValue(point);
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

it.each([
  [{ store_geofence_required: false }, /apply attendance migration 0007/],
  [{ attendance_area: { configured: false } }, /HR must set this store/],
])(
  'blocks a new punch without an activated and configured store area',
  async (changes, message) => {
    const user = userEvent.setup();
    render(
      <PunchCard
        workspace={{ ...workspace, ...changes }}
        onRecorded={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('checkbox', { name: /I agree to share/ }));
    expect(screen.getByRole('button', { name: 'Clock in', exact: true })).toBeDisabled();
    expect(screen.getByText(message)).toBeVisible();
    expect(captureAttendanceLocation).not.toHaveBeenCalled();
    expect(recordAttendance).not.toHaveBeenCalled();
  },
);

it('keeps an outside-area clock-out open and captures a new fix for a later attempt', async () => {
  const user = userEvent.setup();
  const onRecorded = vi.fn();
  recordAttendance.mockRejectedValueOnce(
    new Error('You are outside your store’s attendance area.'),
  );
  recordAttendance.mockResolvedValueOnce({ ...receipt, event_type: 'clock_out' });
  render(
    <PunchCard
      workspace={{ ...workspace, status: 'clocked_in' }}
      onRecorded={onRecorded}
      onRefresh={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('checkbox', { name: /I agree to share/ }));
  await punch(user, 'Clock out');
  expect(await screen.findByRole('alert')).toHaveTextContent('outside');
  expect(onRecorded).not.toHaveBeenCalled();
  await punch(user, 'Clock out');
  await waitFor(() => expect(onRecorded).toHaveBeenCalledOnce());

  expect(recordAttendance.mock.calls[0][0].id).not.toBe(recordAttendance.mock.calls[1][0].id);
});

it('does not turn missing coordinate values into a fabricated zero location or map link', async () => {
  loadAttendanceLocations.mockResolvedValue({
    timezone: 'UTC',
    clock_in: { latitude: null, longitude: null, accuracy_meters: 0 },
    clock_out: null,
  });
  render(
    <AttendanceLocationDetails
      row={{ id: 'session', display_name: 'Test person', attendance_date: '2026-11-07' }}
      onClose={vi.fn()}
    />,
  );
  expect(await screen.findByText('This saved location could not be displayed.')).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
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
  await userEvent.setup().click(screen.getByRole('checkbox'));
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
  await user.click(screen.getByRole('checkbox'));
  await punch(user, 'Clock in');
  expect(await screen.findByRole('button', { name: 'Check attendance request' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Refresh status' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Check attendance request' }));
  expect(recordAttendance.mock.calls[0][0]).toEqual(recordAttendance.mock.calls[1][0]);
  expect(recordAttendance.mock.calls[0][0]).toMatchObject({
    type: 'clock_in',
    previousId: 'previous',
    employeeId: 'employee',
    location: point,
    evidence,
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
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Clock in' }));
  await user.dblClick(screen.getByRole('button', { name: 'Confirm capture' }));
  expect(recordAttendance).toHaveBeenCalledOnce();
  resolve({ status: 'unexpected' });
  expect(await screen.findByRole('button', { name: 'Check attendance request' })).toBeVisible();
  expect(saved).not.toHaveBeenCalled();
});
it('waits for explicit consent and never submits a punch after location permission is denied', async () => {
  evidence.photo.location_at_capture = null;
  const user = userEvent.setup();
  render(<PunchCard workspace={workspace} onRecorded={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Clock in' })).toBeDisabled();
  expect(captureAttendanceLocation).not.toHaveBeenCalled();
  await user.click(screen.getByRole('checkbox'));
  await punch(user, 'Clock in');
  expect(await screen.findByRole('alert')).toHaveTextContent('Verify your location');
  expect(recordAttendance).not.toHaveBeenCalled();
});
it('does not confirm a recording after leaving the attendance screen', async () => {
  let resolve;
  recordAttendance.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const user = userEvent.setup();
  const recorded = vi.fn();
  const view = render(
    <PunchCard workspace={workspace} onRecorded={recorded} onRefresh={vi.fn()} />,
  );
  await user.click(screen.getByRole('checkbox'));
  await punch(user, 'Clock in');
  view.unmount();
  await act(async () => resolve(receipt));
  expect(recorded).not.toHaveBeenCalled();
});
it('does not collect location before the matching server policy is installed', () => {
  render(
    <PunchCard
      workspace={{ ...workspace, location_required: false }}
      onRecorded={vi.fn()}
      onRefresh={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Clock in' })).toBeDisabled();
  expect(screen.getByText(/apply attendance migration 0006/)).toBeVisible();
  expect(captureAttendanceLocation).not.toHaveBeenCalled();
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
