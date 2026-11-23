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

export interface Store {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  timezone: string;
  latitude?: number | null;
  longitude?: number | null;
  map_url?: string | null;
  radius_meters?: number | null;
  active: boolean;
  created_at: string;
}

export interface StoreListResponse {
  items: Store[];
  total: number;
}

export interface StoreAdmin {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  store_id: string;
  store_name: string;
  role: string;
  active: boolean;
  created_at: string;
}

export interface StoreAdminListResponse {
  items: StoreAdmin[];
  total: number;
}

export interface CreateStorePayload {
  code: string;
  name: string;
  timezone?: string;
  latitude?: number | null;
  longitude?: number | null;
  map_url?: string | null;
  radius_meters?: number | null;
}

export interface CreateStoreAdminPayload {
  email: string;
  display_name: string;
  password: string;
}

export async function listStores(
  params: {
    organization_id?: string;
    active_only?: boolean;
    offset?: number;
    limit?: number;
  } = {},
): Promise<StoreListResponse> {
  const query = new URLSearchParams();
  if (params.organization_id) query.set('organization_id', params.organization_id);
  if (params.active_only !== undefined) query.set('active_only', String(params.active_only));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/stores${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getStore(storeId: string): Promise<Store> {
  return apiRequest(`/api/v1/stores/${storeId}`, { method: 'GET' });
}

export async function createStore(
  payload: CreateStorePayload,
  organizationId?: string,
): Promise<Store> {
  const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : '';
  return apiRequest(`/api/v1/stores${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function updateStore(
  storeId: string,
  payload: Partial<CreateStorePayload> & { active?: boolean },
): Promise<Store> {
  return apiRequest(`/api/v1/stores/${storeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listStoreAdmins(storeId: string): Promise<StoreAdminListResponse> {
  return apiRequest(`/api/v1/stores/${storeId}/admins`, { method: 'GET' });
}

export async function listAllStoreAdmins(storeId?: string): Promise<StoreAdminListResponse> {
  const query = storeId ? `?store_id=${encodeURIComponent(storeId)}` : '';
  return apiRequest(`/api/v1/store-admins${query}`, { method: 'GET' });
}

export async function createStoreAdmin(
  storeId: string,
  payload: CreateStoreAdminPayload,
): Promise<StoreAdmin> {
  return apiRequest(`/api/v1/stores/${storeId}/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
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
  organizationId?: string,
): Promise<Employee> {
  const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : '';
  return apiRequest(`/api/v1/employees${query}`, {
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
  organizationId?: string,
): Promise<Shift> {
  const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : '';
  return apiRequest(`/api/v1/shifts${query}`, {
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
  organizationId?: string,
): Promise<ShiftAssignment> {
  const query = organizationId ? `?organization_id=${encodeURIComponent(organizationId)}` : '';
  return apiRequest(`/api/v1/assignments${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}
