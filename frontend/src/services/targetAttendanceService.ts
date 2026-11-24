import { apiRequest, getApiBaseUrl } from '../lib/apiClient';
import { config } from '../lib/config';

export interface StoreQRChallenge {
  challenge_token: string;
  store_id: string;
  expires_at: string;
}

export interface PhotoUploadIntent {
  upload_url: string;
  photo_key: string;
  expires_in: number;
  max_bytes: number;
}

export interface AttendanceEvent {
  id: string;
  organization_id: string;
  store_id: string;
  employee_id: string;
  shift_id: string | null;
  action: 'clock_in' | 'clock_out';
  server_timestamp: string;
  store_timestamp: string;
  photo_key: string;
}

export interface AttendanceEventListResponse {
  items: AttendanceEvent[];
  total: number;
}

export interface RecordAttendancePayload {
  challenge_token: string;
  action: 'clock_in' | 'clock_out';
  photo_key: string;
  location_latitude?: number;
  location_longitude?: number;
  location_accuracy?: number;
  device_info?: string;
}

export interface AttendanceDay {
  id: string;
  organization_id: string;
  store_id: string;
  employee_id: string;
  work_date: string;
  shift_id?: string | null;
  first_in?: string | null;
  last_out?: string | null;
  payable_minutes: number;
  status: string;
  is_missing_punch: boolean;
  is_late: boolean;
  is_early_departure: boolean;
  is_overtime: boolean;
  late_minutes: number;
  early_departure_minutes: number;
  overtime_minutes: number;
  version: number;
  created_at: string;
  updated_at: string;
  employee_name?: string | null;
  employee_code?: string | null;
  store_name?: string | null;
}

export interface AttendanceDayListResponse {
  items: AttendanceDay[];
  total: number;
}

export interface AttendanceAdjustment {
  id: string;
  organization_id: string;
  attendance_day_id: string;
  before_json: Record<string, unknown>;
  after_json: Record<string, unknown>;
  reason: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  requested_by: string;
  approved_by?: string | null;
  review_note?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface AttendanceAdjustmentCreatePayload {
  first_in?: string | null;
  last_out?: string | null;
  reason: string;
  expected_version: number;
}

export interface AttendanceAdjustmentReviewPayload {
  action: 'approve' | 'reject';
  review_note?: string | null;
}

export async function issueStoreQRChallenge(storeId: string): Promise<StoreQRChallenge> {
  return apiRequest(`/api/v1/attendance/challenges/issue?store_id=${storeId}`, {
    method: 'POST',
  });
}

export async function requestPhotoUploadIntent(
  storeId: string,
  contentType = 'image/jpeg',
): Promise<PhotoUploadIntent> {
  return apiRequest('/api/v1/attendance/upload-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ store_id: storeId, content_type: contentType }),
  });
}

export async function recordAttendanceEvent(
  payload: RecordAttendancePayload,
  idempotencyKey: string,
): Promise<AttendanceEvent> {
  return apiRequest('/api/v1/attendance/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export async function listAttendanceEvents(
  params: {
    employee_id?: string;
    store_id?: string;
    start_date?: string;
    end_date?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<AttendanceEventListResponse> {
  const query = new URLSearchParams();
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.store_id) query.set('store_id', params.store_id);
  if (params.start_date) query.set('start_date', params.start_date);
  if (params.end_date) query.set('end_date', params.end_date);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/attendance/events${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function listAttendanceDays(
  params: {
    store_id?: string;
    employee_id?: string;
    from_date?: string;
    to_date?: string;
    status?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<AttendanceDayListResponse> {
  const query = new URLSearchParams();
  if (params.store_id) query.set('store_id', params.store_id);
  if (params.employee_id) query.set('employee_id', params.employee_id);
  if (params.from_date) query.set('from_date', params.from_date);
  if (params.to_date) query.set('to_date', params.to_date);
  if (params.status) query.set('status', params.status);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/attendance/days${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function listMyAttendanceDays(
  params: {
    from_date?: string;
    to_date?: string;
    offset?: number;
    limit?: number;
  } = {},
): Promise<AttendanceDayListResponse> {
  const query = new URLSearchParams();
  if (params.from_date) query.set('from_date', params.from_date);
  if (params.to_date) query.set('to_date', params.to_date);
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  if (params.limit !== undefined) query.set('limit', String(params.limit));

  const qs = query.toString();
  return apiRequest(`/api/v1/attendance/me/days${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export async function getAttendanceDay(dayId: string): Promise<AttendanceDay> {
  return apiRequest(`/api/v1/attendance/days/${dayId}`, { method: 'GET' });
}

export async function requestAttendanceAdjustment(
  dayId: string,
  payload: AttendanceAdjustmentCreatePayload,
): Promise<AttendanceAdjustment> {
  return apiRequest(`/api/v1/attendance/days/${dayId}/adjustments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function reviewAttendanceAdjustment(
  adjustmentId: string,
  payload: AttendanceAdjustmentReviewPayload,
): Promise<AttendanceAdjustment> {
  return apiRequest(`/api/v1/attendance/adjustments/${adjustmentId}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listAttendanceAdjustments(
  params: {
    attendance_day_id?: string;
    status?: string;
  } = {},
): Promise<AttendanceAdjustment[]> {
  const query = new URLSearchParams();
  if (params.attendance_day_id) query.set('attendance_day_id', params.attendance_day_id);
  if (params.status) query.set('status', params.status);

  const qs = query.toString();
  return apiRequest(`/api/v1/attendance/adjustments${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function getAttendanceReportCsvUrl(params: {
  from_date: string;
  to_date: string;
  store_id?: string;
}): string {
  const baseUrl = getApiBaseUrl();
  const qs = new URLSearchParams();
  qs.set('from_date', params.from_date);
  qs.set('to_date', params.to_date);
  if (params.store_id) qs.set('store_id', params.store_id);
  return `${baseUrl}/api/v1/reports/attendance.csv?${qs.toString()}`;
}

export async function uploadPhotoBlob(uploadUrl: string, blob: Blob): Promise<void> {
  const baseUrl = getApiBaseUrl();
  const fullUrl = uploadUrl.startsWith('http') ? uploadUrl : `${baseUrl}${uploadUrl}`;
  try {
    const response = await fetch(fullUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
      },
      body: blob,
      credentials: fullUrl.includes('amazonaws.com') ? 'omit' : 'include',
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const message =
        errorBody?.error?.message ||
        (Array.isArray(errorBody?.detail) ? errorBody.detail[0]?.msg : errorBody?.detail) ||
        `Upload failed with status ${response.status}. Please try again.`;
      throw new Error(message);
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'Failed to fetch') {
        throw new Error(
          `Network error connecting to API server (${fullUrl}). Please verify backend server connectivity.`,
        );
      }
      throw err;
    }
    const rawMsg =
      typeof err === 'object' && err && 'message' in err
        ? String((err as { message: unknown }).message)
        : '';
    throw new Error(rawMsg || 'Failed to upload attendance photo. Please try again.');
  }
}
