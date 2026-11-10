import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import AttendanceCamera from '../features/attendance/AttendanceCamera';
import {
  openAttendanceCamera,
  takeAttendancePhoto,
  stopAttendanceCamera,
} from '../services/attendanceCaptureService';
vi.mock('../services/attendanceCaptureService', () => ({
  openAttendanceCamera: vi.fn(),
  takeAttendancePhoto: vi.fn(),
  stopAttendanceCamera: vi.fn(),
}));
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  openAttendanceCamera.mockResolvedValue({});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('never opens the camera if location is denied or outside the store', async () => {
  render(
    <AttendanceCamera
      beforeOpen={vi.fn().mockRejectedValue(new Error('Outside store or location off'))}
    />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Outside store or location off');
  expect(openAttendanceCamera).not.toHaveBeenCalled();
});
it('rechecks location at the shutter and stops the stream if the user moved outside', async () => {
  const onPhoto = vi.fn();
  render(
    <AttendanceCamera
      beforeOpen={vi.fn().mockResolvedValue({})}
      beforePhoto={vi.fn().mockRejectedValue(new Error('Moved outside store'))}
      onPhoto={onPhoto}
    />,
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled());
  await userEvent.setup().click(screen.getByRole('button', { name: 'Take photo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Moved outside');
  expect(onPhoto).not.toHaveBeenCalled();
  expect(takeAttendancePhoto).not.toHaveBeenCalled();
  expect(stopAttendanceCamera).toHaveBeenCalled();
});
it('discards a location check completed after navigation without opening a camera', async () => {
  let finish;
  const beforeOpen = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<AttendanceCamera beforeOpen={beforeOpen} />);
  view.unmount();
  await act(async () => finish({}));
  expect(openAttendanceCamera).not.toHaveBeenCalled();
});
it('stops an open camera immediately when location permission is revoked', async () => {
  const permission = new EventTarget();
  permission.state = 'granted';
  vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue(permission) } });
  render(<AttendanceCamera beforeOpen={vi.fn().mockResolvedValue({})} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Take photo' })).toBeEnabled());
  await act(async () => {
    permission.state = 'denied';
    permission.dispatchEvent(new Event('change'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Location is off');
  expect(stopAttendanceCamera).toHaveBeenCalled();
});
it('cannot reactivate the shutter if location is revoked while the camera starts playing', async () => {
  let finishPlaying;
  HTMLMediaElement.prototype.play.mockImplementation(
    () =>
      new Promise((resolve) => {
        finishPlaying = resolve;
      }),
  );
  const permission = new EventTarget();
  permission.state = 'granted';
  vi.stubGlobal('navigator', { permissions: { query: vi.fn().mockResolvedValue(permission) } });
  render(<AttendanceCamera beforeOpen={vi.fn().mockResolvedValue({})} />);
  await waitFor(() => expect(finishPlaying).toBeTypeOf('function'));
  await act(async () => {
    permission.state = 'denied';
    permission.dispatchEvent(new Event('change'));
    finishPlaying();
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Location access changed');
  expect(screen.queryByRole('button', { name: 'Take photo' })).not.toBeInTheDocument();
});
