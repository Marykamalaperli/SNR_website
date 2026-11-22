import { describe, expect, it, vi, beforeEach } from 'vitest';
import { apiRequest } from '../lib/apiClient';
import {
  issueStoreQRChallenge,
  requestPhotoUploadIntent,
  recordAttendanceEvent,
  listAttendanceEvents,
} from '../services/targetAttendanceService';

vi.mock('../lib/apiClient', () => ({
  apiRequest: vi.fn(),
}));

describe('targetAttendanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls issueStoreQRChallenge with store_id query param', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      challenge_token: 'token-123',
      store_id: 'store-1',
      expires_at: '2026-11-23T00:00:00Z',
    });

    const res = await issueStoreQRChallenge('store-1');
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/attendance/challenges/issue?store_id=store-1',
      { method: 'POST' },
    );
    expect(res.challenge_token).toBe('token-123');
  });

  it('calls requestPhotoUploadIntent with payload', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      upload_url: '/upload',
      photo_key: 'evidence/photo.jpg',
      expires_in: 300,
      max_bytes: 5242880,
    });

    await requestPhotoUploadIntent('store-1', 'image/jpeg');
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/attendance/upload-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: 'store-1', content_type: 'image/jpeg' }),
    });
  });

  it('calls recordAttendanceEvent with payload and Idempotency-Key header', async () => {
    const payload = {
      challenge_token: 'token-abc',
      action: 'clock_in' as const,
      photo_key: 'evidence/key.jpg',
    };
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 'event-1',
      action: 'clock_in',
      employee_id: 'emp-1',
    });

    const res = await recordAttendanceEvent(payload, 'idempotency-key-100');
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/attendance/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'idempotency-key-100',
      },
      body: JSON.stringify(payload),
    });
    expect(res.id).toBe('event-1');
  });

  it('calls listAttendanceEvents with query parameters', async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({ items: [], total: 0 });

    await listAttendanceEvents({ store_id: 'store-1', limit: 20 });
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/attendance/events?store_id=store-1&limit=20', {
      method: 'GET',
    });
  });
});
