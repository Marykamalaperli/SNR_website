import { getAuthClient } from './authService';

const messages = {
  record_changed:
    'This record changed while you were editing. Close this form, refresh the page and try again.',
  site_name_exists: 'A site with this name already exists.',
  department_name_exists: 'A department with this name already exists.',
  shift_name_exists: 'This site already has a shift with this name.',
  employee_exists: 'The account or employee number already has a profile in this organization.',
  confirmed_account_required:
    'Create and confirm this account under Supabase Authentication → Users, then enter its exact email here.',
  account_unavailable:
    'This account cannot be added here. Ask the project administrator to review its assignments.',
  protected_account:
    'This account has a protected role. Its access must be managed by the project administrator.',
  multiple_supervisor_assignments:
    'This supervisor has several team assignments. Ask the project administrator to review them before editing.',
  shift_in_use:
    'This shift is already assigned or has attendance history. Create a new shift to change its schedule.',
  choose_active_site: 'Choose an active site in this organization.',
  choose_organization_records: 'Choose a site and department in this organization.',
  multiple_workspaces_require_selection:
    'More than one workspace is assigned. Ask your administrator to review your account.',
};

async function request(name, parameters = {}) {
  const client = await getAuthClient();
  if (!client) throw new Error('Please sign in to continue.');
  let result;
  try {
    result = await client.rpc(name, parameters);
  } catch {
    throw new Error('We could not reach your workspace. Check your connection and try again.');
  }
  if (result.error) {
    const { code, message } = result.error;
    if (['PGRST202', '42883', '42703'].includes(code))
      throw new Error(
        'Workforce setup is not installed yet. Ask your project administrator to apply the workforce migration.',
      );
    if (['PT401', 'PGRST301', 'PGRST303'].includes(code))
      throw new Error('Your session has expired. Sign out and sign in again.');
    if (Object.hasOwn(messages, message)) throw new Error(messages[message]);
    if (code === 'PT403' || code === '42501')
      throw new Error(
        'Your account does not have access to this action. Contact your administrator.',
      );
    if (code === 'PT404') throw new Error('This record is no longer available in your workspace.');
    if (code === 'PT422' || code === '22P02' || code === '22007')
      throw new Error(
        'Check the fields and try again. Use valid names, times and a recognized time zone.',
      );
    if (code === '23505' || code === 'PT409')
      throw new Error(
        'The record conflicts with an existing assignment. Refresh and review it before trying again.',
      );
    throw new Error('Your records could not be loaded or saved. Please try again.');
  }
  return result.data;
}

export const loadOrganization = () => request('hr_organization_setup');

export function loadDirectory({
  search = '',
  site = '',
  department = '',
  status = 'active',
  page = 1,
} = {}) {
  return request('workforce_directory', {
    p_search: search.trim(),
    p_site_id: site || null,
    p_department_id: department || null,
    p_status: status,
    p_page: page,
  });
}

export function saveOrganizationRecord(kind, values, record = null) {
  const base = {
    p_id: record?.id || null,
    p_version: record?.version || null,
    p_name: values.name.trim(),
  };
  if (kind === 'site')
    return request('hr_save_site', { ...base, p_timezone: values.timezone.trim() });
  if (kind === 'department') return request('hr_save_department', base);
  if (kind === 'shift')
    return request('hr_save_shift', {
      ...base,
      p_site_id: values.site_id,
      p_starts_at: values.starts_at,
      p_ends_at: values.ends_at,
    });
  throw new Error('Choose a supported organization record.');
}

export function saveEmployee(values, record = null) {
  return request('hr_save_employee', {
    p_id: record?.id || null,
    p_version: record?.version || null,
    p_membership_version: record?.membership_version || null,
    p_email: values.email.trim(),
    p_display_name: values.display_name.trim(),
    p_employee_number: values.employee_number.trim(),
    p_site_id: values.site_id,
    p_department_id: values.department_id,
    p_role: values.role,
    p_active: values.active === 'true',
  });
}
