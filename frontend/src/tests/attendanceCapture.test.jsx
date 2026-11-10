import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import AttendanceCapture from '../features/attendance/AttendanceCapture';
import AttendanceCamera from '../features/attendance/AttendanceCamera';
const photo = {
  jpeg_base64: '/9j/2Q==',
  captured_at: '2026-11-11T00:00:00Z',
  consent_version: 'attendance-photo-location-v1',
  location_at_capture: { latitude: 12, longitude: 77 },
};
vi.mock('../features/attendance/AttendanceCamera', () => ({
  default: vi.fn(({ onPhoto }) => (
    <button onClick={() => onPhoto(photo)}>Take synthetic photo</button>
  )),
}));
it('opens location-gated photo capture directly and reviews/retakes before confirming without QR', async () => {
  const user = userEvent.setup();
  const confirm = vi.fn(),
    checkLocation = vi.fn();
  render(
    <AttendanceCapture
      checkLocation={checkLocation}
      siteName="Main store"
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  const props = AttendanceCamera.mock.calls[0][0];
  expect(props.beforeOpen).toBe(checkLocation);
  expect(props.beforePhoto).toBe(checkLocation);
  expect(screen.queryByText(/Scan QR/)).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Take synthetic photo' }));
  expect(screen.getByAltText('Your attendance photo for review')).toBeVisible();
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retake photo' }));
  await user.click(screen.getByRole('button', { name: 'Take synthetic photo' }));
  await user.click(screen.getByRole('button', { name: 'Confirm clock in' }));
  expect(confirm).toHaveBeenCalledWith({ photo });
});
it('requires confirmation for clock-out and blocks confirmation while saving', async () => {
  const user = userEvent.setup(),
    confirm = vi.fn();
  const props = {
    checkLocation: vi.fn(),
    clockedIn: true,
    siteName: 'Main store',
    onClose: vi.fn(),
    onConfirm: confirm,
  };
  const view = render(<AttendanceCapture {...props} />);
  await user.click(screen.getByRole('button', { name: 'Take synthetic photo' }));
  expect(screen.getByRole('button', { name: 'Confirm clock out' })).toBeEnabled();
  view.rerender(<AttendanceCapture {...props} busy />);
  expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled();
  expect(confirm).not.toHaveBeenCalled();
});
