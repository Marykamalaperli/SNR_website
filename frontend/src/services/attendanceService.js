import { getAuthClient } from './authService';

const messages = {
  attendance_passkey_required:
    'Verify with your HR-approved passkey. If this is a new device, enroll it here and ask HR to approve it in person.',
  attendance_passkey_pending:
    'An attendance passkey is already enrolled. Ask HR to approve it or reset it after verifying your identity.',
  attendance_identity_expired:
    'Identity verification expired. Refresh the security page and take a fresh photo.',
  security_flow_required:
    'Open the security attendance page and verify your sign-in before recording attendance.',
  attendance_open_elsewhere:
    'Your attendance screen is active in another tab or device. Close that screen and wait 90 seconds before retrying here.',
  security_check_expired:
    'The two-minute photo-check window has ended. This check is recorded for HR review; do not submit an older photo.',
  personal_qr_retired:
    'Individual QR codes have been replaced. Use the common attendance QR and sign in with your own account.',

  employee_qr_invalid:
    'This QR is invalid, replaced, or no longer active. Ask HR for the current employee QR.',

  employee_name_required:
    'Ask HR to save your full name in your employee profile before clocking in or out.',
  attendance_storage_required:
    'Photo Storage is not installed yet. Ask your administrator to apply migration 0009.',
  attendance_upload_unavailable:
    'Photo upload is unavailable. Your administrator must configure the private Supabase server binding in Cloudflare Pages.',
  attendance_photo_expired: 'This photo request expired. Refresh attendance and take a new photo.',
  attendance_photo_not_uploaded:
    'The photo upload is not confirmed. Check the same attendance request.',
  attendance_photo_rate_limit: 'Too many photo requests. Wait a minute and try again.',
  invalid_store_map_link: 'Use a supported HTTPS map link for the store.',
  map_coordinates_unavailable:
    'This map link could not be resolved. Copy a full link containing coordinates, or enter them manually.',
  sign_in_required: 'Your session has expired. Sign out and sign in again.',
  attendance_evidence_required: 'Take a photo and share your location before clocking in or out.',
  invalid_attendance_photo: 'A camera JPEG photo of up to 150 KB is required. Retake your photo.',
  stale_attendance_photo: 'Your photo has expired. Take a fresh photo at your store.',
  store_area_not_configured:
    'HR must set your store’s attendance area before you can clock in or out.',
  outside_store_area:
    'You are outside your store’s attendance area. Move to the store and try again.',
  store_location_uncertain:
    'Location accuracy is too low to confirm you are inside the store area. Enable precise location, move closer to the store and try again.',
  attendance_location_required:
    'Location is required for clock-in and clock-out. Reload the page and allow location access.',
  invalid_attendance_location:
    'A valid location and consent are required. Enable precise location and try again.',
  stale_attendance_location:
    'Capture a fresh location and check your device’s date and time, then try again.',
  legacy_attendance_request:
    'This request predates location capture. Refresh your attendance status before a new action.',
  record_changed: 'This record changed. Close the form, refresh the directory and try again.',
  employee_shift_required: 'Shift assignments are available for active employee accounts.',
  employee_profile_required: 'Your employee profile is not active. Contact HR.',
  invalid_shift_dates: 'Choose a shift at this employee’s site and check the assignment dates.',
  shift_assignment_overlap:
    'These dates overlap an existing assignment. End that assignment first.',
  shift_assignment_closed: 'This assignment has ended or changed. Refresh its details.',
  shift_has_attendance: 'This change would affect attendance history. Keep the recorded dates.',
  shift_not_assigned: 'Ask HR to assign your shift before clocking in.',
  attendance_site_inactive: 'Your work site is inactive. Contact HR before clocking in.',
  open_attendance_session: 'Clock out before changing this person’s site, department or role.',
  attendance_changed:
    'Your attendance changed in another request. Refresh your status before trying again.',
  already_clocked_in: 'You are already clocked in. Refresh your attendance status.',
  not_clocked_in: 'You are already clocked out. Refresh your attendance status.',
  attendance_request_changed: 'This request has changed. Refresh attendance before trying again.',
  invalid_attendance_filters: 'Choose a date range of up to 31 days and check the filters.',
};

async function request(name, parameters = {}) {
  const client = await getAuthClient();
  if (!client) throw new Error('Please sign in to continue.');
  let result;
  try {
    result = await client.rpc(name, parameters);
  } catch {
    const error = new Error(
      'The request could not be confirmed. Check your connection and try again.',
    );
    error.retryable = true;
    throw error;
  }
  if (result.error) {
    const { code, message } = result.error;
    let text = 'Attendance could not be loaded or saved. Please try again.';
    if (['PGRST202', '42883', '42703'].includes(code))
      text =
        'Attendance is not installed yet. Ask your project administrator to apply the attendance migration.';
    else if (['PT401', 'PGRST301', 'PGRST303'].includes(code))
      text = 'Your session has expired. Sign out and sign in again.';
    else if (Object.hasOwn(messages, message)) text = messages[message];
    else if (['PT403', '42501'].includes(code))
      text = 'Your account does not have access to this action. Contact HR.';
    else if (code === 'PT404') text = 'This record is no longer available in your workspace.';
    else if (['PT422', '22P02', '22007', '22008'].includes(code))
      text = 'Check the selected shift, dates and required fields.';
    const error = new Error(text);
    error.retryable =
      !code ||
      Number(result.status) >= 500 ||
      ['57014', 'PGRST000', 'PGRST001', 'PGRST002'].includes(code);
    throw error;
  }
  return result.data;
}

export const loadAttendanceWorkspace = () => request('attendance_workspace');
export const loadEmployeeQr = (employeeId, rotate = false, version = null) =>
  request('hr_employee_attendance_qr', {
    p_employee_id: employeeId,
    p_rotate: rotate,
    p_version: version,
  });
export const loadQrAttendanceWorkspace = (token) =>
  request('employee_qr_attendance_workspace', { p_token: token });
export function loadAttendanceRecords({
  from,
  to,
  search = '',
  site = '',
  department = '',
  status = 'all',
  page = 1,
}) {
  return request('attendance_records', {
    p_from: from,
    p_to: to,
    p_search: search.trim(),
    p_site_id: site || null,
    p_department_id: department || null,
    p_status: status,
    p_page: page,
  });
}
export const validateAttendanceLocation = (
  { type, previousId, employeeId, securityFlowId },
  location,
) =>
  securityFlowId
    ? attendanceGatewayRequest('security/location', {
        flowId: securityFlowId,
        type,
        previousId: previousId || null,
        employeeId,
        location,
      })
    : request('validate_attendance_location', {
        p_employee_id: employeeId,
        p_event_type: type,
        p_previous_event_id: previousId || null,
        p_location: location,
      });
export async function attendanceGatewayRequest(path, body) {
  const client = await getAuthClient();
  const { data, error } = (await client?.auth.getSession()) || {};
  if (error || !data?.session?.access_token) throw new Error(messages.sign_in_required);
  const accessToken = data.session.access_token;
  let response, result;
  try {
    response = await fetch('/api/attendance/' + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(35000),
    });
    if (!response.headers.get('Content-Type')?.includes('application/json'))
      throw new Error('Invalid server response');
    result = await response.json();
  } catch {
    throw Object.assign(
      new Error(
        'The upload could not be confirmed. Check the same attendance request to avoid a duplicate.',
      ),
      { retryable: true },
    );
  }
  if (!response.ok) {
    const code = result.error?.code;
    throw Object.assign(
      new Error(
        Object.hasOwn(messages, code)
          ? messages[code]
          : 'This request could not be completed. Please try again.',
      ),
      { retryable: response.status >= 500 },
    );
  }
  return result;
}
export { request as attendanceRpc };
export function attendanceActionPayload({
  type,
  id,
  previousId,
  employeeId,
  location,
  evidence,
  checkId,
}) {
  return {
    type,
    id,
    previousId: previousId || null,
    employeeId: employeeId || null,
    location: location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy_meters: location.accuracy_meters,
          captured_at: location.captured_at,
          consent_version: location.consent_version,
        }
      : null,
    evidence: evidence
      ? {
          photo: {
            jpeg_base64: evidence.photo.jpeg_base64,
            captured_at: evidence.photo.captured_at,
            consent_version: evidence.photo.consent_version,
          },
        }
      : null,
    ...(type === 'security_check' ? { checkId } : {}),
  };
}
export const recordAttendance = (action) =>
  attendanceGatewayRequest(action.securityFlowId ? 'security/photos' : 'photos', {
    ...attendanceActionPayload(action),
    ...(action.securityFlowId
      ? { flowId: action.securityFlowId, identityId: action.identityId }
      : {}),
  });
export async function loadAttendanceLocations(id) {
  const result = await request('attendance_location_details', { p_session_id: id });
  const client = await getAuthClient();
  for (const kind of ['clock_in', 'clock_out']) {
    const photo = result[kind]?.photo;
    if (photo?.bucket_id && photo.object_path) {
      if (!['attendance-clock-in', 'attendance-clock-out'].includes(photo.bucket_id))
        throw new Error('Invalid saved photo bucket.');
      const { data, error } = await client.storage
        .from(photo.bucket_id)
        .createSignedUrl(photo.object_path, 60);
      if (error || !data?.signedUrl)
        throw new Error('The saved photo could not be opened. Refresh its details and try again.');
      photo.signed_url = data.signedUrl;
    }
  }
  return result;
}
export const loadEmployeeShifts = (id) => request('hr_employee_shifts', { p_employee_id: id });
export const saveEmployeeShift = (employee, values, assignment = null, cancel = false) =>
  request('hr_save_employee_shift', {
    p_employee_id: employee.employee_id,
    p_employee_version: employee.employee_version,
    p_id: assignment?.id || null,
    p_version: assignment?.version || null,
    p_shift_id: assignment?.shift_id || values.shift_id,
    p_starts_on: assignment?.starts_on || values.starts_on,
    p_ends_on: cancel ? assignment.ends_on : values.ends_on || null,
    p_cancel: cancel,
  });
