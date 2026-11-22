import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiRequest } from '../lib/apiClient';
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  listShifts,
  createShift,
  listAssignments,
  createAssignment,
} from '../services/targetWorkforceService';

vi.mock('../lib/apiClient', () => ({
  apiRequest: vi.fn(),
}));

describe('targetWorkforceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls listEmployees with query parameters', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [], total: 0 });

    await listEmployees({ store_id: 'store-1', status: 'active', limit: 10 });

    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/employees?store_id=store-1&status=active&limit=10',
      { method: 'GET' },
    );
  });

  it('calls getEmployee by id', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'emp-1', display_name: 'Test' });

    const result = await getEmployee('emp-1');

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/employees/emp-1', { method: 'GET' });
    expect(result.id).toBe('emp-1');
  });

  it('calls createEmployee with JSON body and organization_id in query', async () => {
    const payload = {
      employee_code: 'E001',
      display_name: 'Jane Doe',
      home_store_id: 'store-1',
      hire_date: '2026-01-01',
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'emp-1', ...payload });

    await createEmployee(payload, 'org-1');

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/employees?organization_id=org-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('calls deactivateEmployee endpoint', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'emp-1', status: 'deactivated' });

    await deactivateEmployee('emp-1');

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/employees/emp-1/deactivate', {
      method: 'POST',
    });
  });

  it('calls listShifts with parameters', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [], total: 0 });

    await listShifts({ active_only: true, store_id: 'store-1' });

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/shifts?store_id=store-1&active_only=true', {
      method: 'GET',
    });
  });

  it('calls createShift with payload', async () => {
    const payload = {
      code: 'MORN',
      name: 'Morning',
      store_id: 'store-1',
      start_time: '08:00:00',
      end_time: '16:00:00',
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'shift-1', ...payload });

    await createShift(payload, 'org-1');

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/shifts?organization_id=org-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('calls createAssignment with payload', async () => {
    const payload = {
      employee_id: 'emp-1',
      shift_id: 'shift-1',
      effective_from: '2026-06-01',
      effective_until: '2026-06-30',
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({ id: 'assign-1', ...payload });

    await createAssignment(payload, 'org-1');

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/assignments?organization_id=org-1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });
});
