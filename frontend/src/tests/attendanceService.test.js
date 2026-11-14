import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getAuthClient } from '../services/authService';
import {
  loadAttendanceRecords,
  loadAttendanceWorkspace,
  loadEmployeeShifts,
  loadAttendanceLocations,
  recordAttendance,
  saveEmployeeShift,
} from '../services/attendanceService';
vi.mock('../services/authService', () => ({ getAuthClient: vi.fn() }));
let client;
beforeEach(() => {
  client = {
    rpc: vi.fn().mockResolvedValue({ data: {}, error: null }),
    auth: {
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'fixture-user-token' } } }),
    },
  };
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('{}', { headers: { 'Content-Type': 'application/json' } })),
  );
  getAuthClient.mockResolvedValue(client);
});

afterEach(() => vi.unstubAllGlobals());
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
  expect(fetch.mock.calls[0][0]).toBe('/api/attendance/photos');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    type: 'clock_in',
    id: 'request',
    previousId: 'previous',
    employeeId: 'employee',
    evidence: null,
    location: {
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
it('sends only camera proof fields, excluding caller identity and extra photo data', async () => {
  await recordAttendance({
    type: 'clock_out',
    id: 'retry',
    evidence: {
      organization_id: 'forged',
      qr: 'obsolete-client-qr',
      photo: {
        jpeg_base64: 'jpeg',
        captured_at: 'instant',
        consent_version: 'notice',
        user_id: 'forged',
      },
    },
  });
  expect(JSON.parse(fetch.mock.calls[0][1].body).evidence).toEqual({
    photo: { jpeg_base64: 'jpeg', captured_at: 'instant', consent_version: 'notice' },
  });
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
    const failure = loadAttendanceWorkspace();
    await expect(failure).rejects.toThrow(expected);
    await expect(failure).rejects.toMatchObject({ retryable });
  },
);
it('keeps lost upload responses retryable with the same request ID', async () => {
  fetch.mockRejectedValueOnce(new Error('PRIVATE TOKEN'));
  const action = { type: 'clock_in', id: 'request' };
  await expect(recordAttendance(action)).rejects.toMatchObject({ retryable: true });
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { code: 'attendance_request_failed' } }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  await expect(recordAttendance(action)).rejects.toMatchObject({ retryable: true });
  expect(fetch.mock.calls[0][1].body).toBe(fetch.mock.calls[1][1].body);
});
it('loads private photos through short-lived signed Storage URLs', async () => {
  client.rpc.mockResolvedValue({
    data: {
      clock_in: { photo: { bucket_id: 'attendance-clock-in', object_path: 'org/user/file.jpg' } },
      clock_out: null,
    },
    error: null,
  });
  const signed = vi.fn().mockResolvedValue({
    data: { signedUrl: 'https://storage.example.invalid/photo?token=fixture' },
    error: null,
  });
  client.storage = { from: vi.fn().mockReturnValue({ createSignedUrl: signed }) };
  const result = await loadAttendanceLocations('session');
  expect(client.storage.from).toHaveBeenCalledWith('attendance-clock-in');
  expect(signed).toHaveBeenCalledWith('org/user/file.jpg', 60);
  expect(result.clock_in.photo.signed_url).toContain('token=fixture');
});

it('requires a signed-in session for all attendance gateway requests', async () => {
  const { attendanceGatewayRequest } = await import('../services/attendanceService');
  client.auth.getSession.mockResolvedValue({ data: { session: null } });
  await expect(
    attendanceGatewayRequest('security/workspace', { clientId: 'client' }),
  ).rejects.toThrow('session has expired');
  expect(fetch).not.toHaveBeenCalled();
});
it('binds security preflight and upload to the flow, identity proof and caller JWT without QR credentials', async () => {
  fetch.mockImplementation(
    async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
  );
  const { validateAttendanceLocation } = await import('../services/attendanceService');
  await validateAttendanceLocation(
    { securityFlowId: 'flow', type: 'clock_out', previousId: 'open', employeeId: 'employee' },
    { latitude: 12 },
  );
  await recordAttendance({
    securityFlowId: 'flow',
    identityId: 'proof',
    type: 'clock_out',
    id: 'request',
    employeeId: 'employee',
    evidence: {
      qr: 'obsolete',
      photo: { jpeg_base64: 'jpeg', captured_at: 'now', consent_version: 'notice' },
    },
  });
  expect(fetch.mock.calls.map((c) => c[0])).toEqual([
    '/api/attendance/security/location',
    '/api/attendance/security/photos',
  ]);
  for (const [, options] of fetch.mock.calls) {
    expect(options.headers.Authorization).toBe('Bearer fixture-user-token');
    expect(JSON.parse(options.body).flowId).toBe('flow');
    expect(JSON.parse(options.body)).not.toHaveProperty('qrToken');
  }
  const payload = JSON.parse(fetch.mock.calls[1][1].body);
  expect(payload.identityId).toBe('proof');
  expect(payload.evidence).not.toHaveProperty('qr');
});
