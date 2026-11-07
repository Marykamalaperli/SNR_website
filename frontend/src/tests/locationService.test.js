import { afterEach, expect, it, vi } from 'vitest';
import { captureAttendanceLocation } from '../services/locationService';
afterEach(() => vi.useRealTimers());

const timestamp = Date.parse('2026-11-07T04:00:00Z');
function device(
  position = { coords: { latitude: 0, longitude: 0, accuracy: 8.5, altitude: 99 }, timestamp },
) {
  return { getCurrentPosition: vi.fn((success) => success(position)) };
}
it('requests a fresh high-accuracy fix and retains only the necessary fields, including valid zero coordinates', async () => {
  const geolocation = device();
  expect(
    await captureAttendanceLocation({ geolocation, secure: true, now: () => timestamp }),
  ).toEqual({
    latitude: 0,
    longitude: 0,
    accuracy_meters: 8.5,
    captured_at: '2026-11-07T04:00:00.000Z',
    consent_version: 'attendance-location-v1',
  });
  expect(geolocation.getCurrentPosition).toHaveBeenCalledWith(
    expect.any(Function),
    expect.any(Function),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
  );
});
it.each([
  [1, 'permission was denied'],
  [2, 'location is unavailable'],
  [3, 'took too long'],
  [999, 'could not be determined'],
])(
  'sanitizes device failure %s without exposing arbitrary provider text',
  async (code, message) => {
    const geolocation = {
      getCurrentPosition: (_success, fail) => fail({ code, message: 'PRIVATE LOCATION' }),
    };
    await expect(captureAttendanceLocation({ geolocation, secure: true })).rejects.toThrow(message);
  },
);
it.each([
  { coords: { latitude: 91, longitude: 0, accuracy: 8 }, timestamp },
  { coords: { latitude: 0, longitude: 0, accuracy: Infinity }, timestamp },
  { coords: { latitude: 0, longitude: 0, accuracy: 8 }, timestamp: timestamp - 121000 },
])('rejects invalid or stale device coordinates', async (position) => {
  await expect(
    captureAttendanceLocation({
      geolocation: device(position),
      secure: true,
      now: () => timestamp,
    }),
  ).rejects.toThrow('fresh location');
});
it('bounds a provider that never calls back and handles unsupported/insecure browsers', async () => {
  await expect(captureAttendanceLocation({ secure: false, geolocation: device() })).rejects.toThrow(
    'secure connection',
  );
  await expect(captureAttendanceLocation({ secure: true, geolocation: {} })).rejects.toThrow(
    'cannot provide a location',
  );
  vi.useFakeTimers();
  const pending = captureAttendanceLocation({
    secure: true,
    geolocation: { getCurrentPosition: vi.fn() },
  });
  const rejected = expect(pending).rejects.toThrow('took too long');
  await vi.advanceTimersByTimeAsync(25000);
  await rejected;
});
