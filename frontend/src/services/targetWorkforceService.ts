import { apiRequest } from '../lib/apiClient';

export interface Employee {
  id: string;
  organization_id: string;
  home_store_id: string;
  user_id: string | null;
  employee_code: string;
  display_name: string;
  status: 'active' | 'deactivated';
  hire_date: string;
  exit_date: string | null;
}

export interface EmployeeListResponse {
  items: Employee[];
  total: number;
}

export interface Shift {
  id: string;
  organization_id: string;
  store_id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  is_overnight: boolean;
  active: boolean;
}

export interface ShiftListResponse {
  items: Shift[];
  total: number;
}

export interface ShiftAssignment {
  id: string;
  organization_id: string;
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_until: string;
}

export interface AssignmentListResponse {
  items: ShiftAssignment[];
  total: number;
}

export interface CreateEmployeePayload {
  employee_code: string;
  display_name: string;
  home_store_id: string;
  user_id?: string | null;
  hire_date: string;
  status?: 'active' | 'deactivated';
}

export interface CreateShiftPayload {
  code: string;
  name: string;
  store_id: string;
  start_time: string;
  end_time: string;
  break_minutes?: number;
  is_overnight?: boolean;
}

export interface CreateAssignmentPayload {
  employee_id: string;
  shift_id: string;
  effective_from: string;
  effective_until: string;
}

export async function listEmployees(
  params: {
    store_id?: string;
    status?: string;
    search?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<EmployeeListResponse> {
  const query = new URLSearchParams();
  if (params.store_id) query.set('store_id', params.store_id);
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/employees${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getEmployee(employeeId: string): Promise<Employee> {
  return apiRequest(`/api/v1/employees/${employeeId}`, { method: 'GET' });
}

export async function createEmployee(
  payload: CreateEmployeePayload,
  organizationId: string,
): Promise<Employee> {
  return apiRequest(`/api/v1/employees?organization_id=${organizationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateEmployee(
  employeeId: string,
  payload: Partial<CreateEmployeePayload> & { exit_date?: string },
): Promise<Employee> {
  return apiRequest(`/api/v1/employees/${employeeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deactivateEmployee(employeeId: string): Promise<Employee> {
  return apiRequest(`/api/v1/employees/${employeeId}/deactivate`, {
    method: 'POST',
  });
}

export async function listShifts(
  params: {
    store_id?: string;
    active_only?: boolean;
    offset?: number;
    limit?: number;
  } = {},
): Promise<ShiftListResponse> {
  const query = new URLSearchParams();
  if (params.store_id) query.set('store_id', params.store_id);
  if (params.active_only !== undefined) query.set('active_only', String(params.active_only));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/shifts${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function createShift(
  payload: CreateShiftPayload,
  organizationId: string,
): Promise<Shift> {
  return apiRequest(`/api/v1/shifts?organization_id=${organizationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listAssignments(
  params: {
    employee_id?: string;
    store_id?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<AssignmentListResponse> {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.store_id) query.set('store_id', params.store_id);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/assignments${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function createAssignment(
  payload: CreateAssignmentPayload,
  organizationId: string,
): Promise<ShiftAssignment> {
  return apiRequest(`/api/v1/assignments?organization_id=${organizationId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
