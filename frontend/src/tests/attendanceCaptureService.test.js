import { afterEach, expect, it, vi } from 'vitest';
import {
  openAttendanceCamera,
  stopAttendanceCamera,
  takeAttendancePhoto,
} from '../services/attendanceCaptureService';

afterEach(() => vi.unstubAllGlobals());
it('requires a secure camera and sanitizes permission failures; microphone stays disabled', async () => {
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('private detail'), { name: 'NotAllowedError' }));
  vi.stubGlobal('isSecureContext', false);
  await expect(openAttendanceCamera('user')).rejects.toThrow('HTTPS');
  expect(getUserMedia).not.toHaveBeenCalled();
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  await expect(openAttendanceCamera('environment')).rejects.toThrow('permission was denied');
  expect(getUserMedia.mock.calls[0][0]).toMatchObject({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  });
});
it('bounds photo dimensions and size, stamps consent, and stops all camera tracks', () => {
  const drawImage = vi.fn();
  const canvas = {
    getContext: () => ({ drawImage }),
    toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==',
  };
  const photo = takeAttendancePhoto({ videoWidth: 1280, videoHeight: 720 }, canvas);
  expect([canvas.width, canvas.height]).toEqual([640, 360]);
  expect(photo.consent_version).toBe('attendance-photo-location-v1');
  expect(Date.parse(photo.captured_at)).toBeGreaterThan(0);
  canvas.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(204801);
  expect(() => takeAttendancePhoto({ videoWidth: 1280, videoHeight: 720 }, canvas)).toThrow(
    'too large',
  );
  expect(() => takeAttendancePhoto({ videoWidth: 0 }, canvas)).toThrow('Wait for the camera');
  const stop = vi.fn();
  stopAttendanceCamera({ getTracks: () => [{ stop }, { stop }] });
  expect(stop).toHaveBeenCalledTimes(2);
});
