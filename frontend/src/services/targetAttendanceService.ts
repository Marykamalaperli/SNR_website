import { apiRequest } from '../lib/apiClient';

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
