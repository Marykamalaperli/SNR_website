import { beforeEach, expect, it, vi } from 'vitest';
import { getAuthClient } from '../services/authService';
import {
  loadAttendanceRecords,
  loadAttendanceWorkspace,
  loadEmployeeShifts,
  recordAttendance,
  saveEmployeeShift,
} from '../services/attendanceService';
vi.mock('../services/authService', () => ({ getAuthClient: vi.fn() }));
let client;
beforeEach(() => {
  client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
  getAuthClient.mockResolvedValue(client);
});

it('sends a punch intent and expected state without client-selected identity, tenant or timestamps', async () => {
  await recordAttendance({
    type: 'clock_in',
    id: 'request',
    previousId: 'previous',
    employeeId: 'employee',
    location: {
      latitude: 12.97,
      longitude: 77.59,
      accuracy_meters: 9,
      captured_at: '2026-11-07T04:00:00Z',
      consent_version: 'attendance-location-v1',
      altitude: 777,
      user_id: 'forged',
    },
    user_id: 'forged',
    organization_id: 'forged',
    occurred_at: 'historical',
  });
  expect(client.rpc).toHaveBeenCalledWith('record_attendance', {
    p_event_type: 'clock_in',
    p_request_id: 'request',
    p_previous_event_id: 'previous',
    p_employee_id: 'employee',
    p_location: {
      latitude: 12.97,
      longitude: 77.59,
      accuracy_meters: 9,
      captured_at: '2026-11-07T04:00:00Z',
      consent_version: 'attendance-location-v1',
    },
  });
});
it('uses authenticated read functions and forwards literal, bounded filter proposals', async () => {
  await loadAttendanceWorkspace();
  await loadEmployeeShifts('employee');
  await loadAttendanceRecords({
    from: '2026-11-01',
    to: '2026-11-07',
    search: ' literal% ',
    page: 2,
  });
  expect(client.rpc.mock.calls).toEqual([
    ['attendance_workspace', {}],
    ['hr_employee_shifts', { p_employee_id: 'employee' }],
    [
      'attendance_records',
      {
        p_from: '2026-11-01',
        p_to: '2026-11-07',
        p_search: 'literal%',
        p_site_id: null,
        p_department_id: null,
        p_status: 'all',
        p_page: 2,
      },
    ],
  ]);
});
it('checks employee/assignment snapshots and retains immutable shift/start fields during edits', async () => {
  const employee = { employee_id: 'employee', employee_version: 7 };
  const plan = {
    id: 'plan',
    version: 3,
    shift_id: 'original',
    starts_on: '2026-11-01',
    ends_on: null,
  };
  await saveEmployeeShift(
    employee,
    { shift_id: 'forged', starts_on: 'historical', ends_on: '2026-11-10', user_id: 'forged' },
    plan,
  );
  expect(client.rpc).toHaveBeenCalledWith('hr_save_employee_shift', {
    p_employee_id: 'employee',
    p_employee_version: 7,
    p_id: 'plan',
    p_version: 3,
    p_shift_id: 'original',
    p_starts_on: '2026-11-01',
    p_ends_on: '2026-11-10',
    p_cancel: false,
  });
});
it.each([
  ['PT409', 'attendance_changed', 'Refresh your status', false],
  ['PT409', 'shift_assignment_overlap', 'overlap', false],
  ['PT403', 'PRIVATE DATA', 'does not have access', false],
  ['PGRST202', 'PRIVATE DATA', 'attendance migration', false],
  ['PGRST301', 'PRIVATE DATA', 'session has expired', false],
  ['', 'PRIVATE DATA', 'could not be loaded or saved', true],
])(
  'sanitizes %s / %s without confusing a definitive denial with a lost response',
  async (code, message, expected, retryable) => {
    client.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const failure = recordAttendance({ type: 'clock_in', id: 'request' });
    await expect(failure).rejects.toThrow(expected);
    await expect(failure).rejects.toMatchObject({ retryable });
  },
);
it('keeps network/503 outcomes retryable using the same idempotency key', async () => {
  client.rpc.mockRejectedValueOnce(new Error('PRIVATE TOKEN'));
  await expect(recordAttendance({ type: 'clock_in', id: 'request' })).rejects.toMatchObject({
    retryable: true,
  });
  client.rpc.mockResolvedValue({
    data: null,
    error: { code: 'unexpected', message: 'PRIVATE DATA' },
    status: 503,
  });
  await expect(recordAttendance({ type: 'clock_in', id: 'request' })).rejects.toMatchObject({
    retryable: true,
  });
});
