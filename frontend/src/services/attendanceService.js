import { getAuthClient } from './authService';

const messages = {
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
export const recordAttendance = ({ type, id, previousId, employeeId, location }) =>
  request('record_attendance', {
    p_event_type: type,
    p_request_id: id,
    p_previous_event_id: previousId || null,
    p_employee_id: employeeId || null,
    p_location: location
      ? {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy_meters: location.accuracy_meters,
          captured_at: location.captured_at,
          consent_version: location.consent_version,
        }
      : null,
  });
export const loadAttendanceLocations = (id) =>
  request('attendance_location_details', { p_session_id: id });
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
