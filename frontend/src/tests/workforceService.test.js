import { beforeEach, expect, it, vi } from 'vitest';
import { getAuthClient } from '../services/authService';
import {
  loadDirectory,
  loadOrganization,
  saveEmployee,
  saveOrganizationRecord,
} from '../services/workforceService';

vi.mock('../services/authService', () => ({ getAuthClient: vi.fn() }));
let rpc;
beforeEach(() => {
  rpc = vi
    .fn()
    .mockResolvedValue({ data: { rows: [], total: 0, page: 1, page_size: 20 }, error: null });
  getAuthClient.mockResolvedValue({ rpc });
});

it('sends bounded directory filters without accepting caller identity or tenant as authority', async () => {
  await loadDirectory({
    search: '  Person %  ',
    site: 'site-id',
    page: 2,
    organization_id: 'forged-org',
    user_id: 'forged-user',
    role: 'hr',
  });
  expect(rpc).toHaveBeenCalledWith('workforce_directory', {
    p_search: 'Person %',
    p_site_id: 'site-id',
    p_department_id: null,
    p_status: 'active',
    p_page: 2,
  });
  await loadOrganization();
  expect(rpc).toHaveBeenLastCalledWith('hr_organization_setup', {});
});

it('includes both edit versions and explicit account access in an employee save', async () => {
  await saveEmployee(
    {
      email: ' account@example.invalid ',
      display_name: ' Person ',
      employee_number: ' SNR-1 ',
      site_id: 'site',
      department_id: 'department',
      role: 'supervisor',
      active: 'false',
    },
    { id: 'profile', version: 3, membership_version: 7 },
  );
  expect(rpc).toHaveBeenCalledWith('hr_save_employee', {
    p_id: 'profile',
    p_version: 3,
    p_membership_version: 7,
    p_email: 'account@example.invalid',
    p_display_name: 'Person',
    p_employee_number: 'SNR-1',
    p_site_id: 'site',
    p_department_id: 'department',
    p_role: 'supervisor',
    p_active: false,
  });
});

it('sends site time zones and shift times without browser-generated audit fields', async () => {
  await saveOrganizationRecord('site', { name: ' Main office ', timezone: ' Asia/Kolkata ' });
  expect(rpc).toHaveBeenLastCalledWith('hr_save_site', {
    p_id: null,
    p_version: null,
    p_name: 'Main office',
    p_timezone: 'Asia/Kolkata',
  });
  await saveOrganizationRecord(
    'shift',
    { name: ' Night ', site_id: 'site', starts_at: '22:00', ends_at: '06:00' },
    { id: 'shift', version: 2 },
  );
  expect(rpc).toHaveBeenLastCalledWith('hr_save_shift', {
    p_id: 'shift',
    p_version: 2,
    p_name: 'Night',
    p_site_id: 'site',
    p_starts_at: '22:00',
    p_ends_at: '06:00',
  });
});

it.each([
  ['PGRST202', 'missing procedure', 'migration'],
  ['PT422', 'confirmed_account_required', 'Create and confirm'],
  ['PT409', 'record_changed', 'changed while you were editing'],
  ['PT403', 'protected_account', 'protected role'],
  ['PT403', 'private database details', 'does not have access'],
  ['PT500', 'private database details', 'could not be loaded or saved'],
  ['PT500', '__proto__', 'could not be loaded or saved'],
])(
  'sanitizes %s errors and gives useful recovery instructions',
  async (code, message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } });
    await expect(loadOrganization()).rejects.toThrow(expected);
    await expect(loadOrganization()).rejects.not.toThrow('private database details');
  },
);

it('handles unavailable configuration and network failures without reflecting response details', async () => {
  getAuthClient.mockResolvedValueOnce(null);
  await expect(loadOrganization()).rejects.toThrow('Please sign in');
  rpc.mockRejectedValue(new Error('private network response'));
  await expect(loadDirectory()).rejects.toThrow('Check your connection');
});
