import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import AttendanceCapture from '../features/attendance/AttendanceCapture';
import { verifyAttendanceQr } from '../services/attendanceService';

const qr =
  'snr-attendance:v1:20000000-0000-4000-8000-000000000001:a0000000-0000-4000-8000-000000000001';
const photo = {
  jpeg_base64: '/9j/2Q==',
  captured_at: '2026-11-10T00:00:00Z',
  consent_version: 'attendance-photo-location-v1',
};
let scanned = qr;
vi.mock('../services/attendanceService', () => ({ verifyAttendanceQr: vi.fn() }));
vi.mock('../features/attendance/AttendanceCamera', () => ({
  default: ({ scanning, onScan, onPhoto }) => (
    <button onClick={() => (scanning ? onScan(scanned) : onPhoto(photo))}>
      {scanning ? 'Scan synthetic QR' : 'Take synthetic photo'}
    </button>
  ),
}));
beforeEach(() => {
  scanned = qr;
  verifyAttendanceQr.mockResolvedValue({ site_id: 'site' });
});

it('requires QR verification and reviewed photo before confirming a punch; supports retaking', async () => {
  const user = userEvent.setup();
  const confirm = vi.fn();
  render(
    <AttendanceCapture
      verifyQr={verifyAttendanceQr}
      siteName="Main store"
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  expect(verifyAttendanceQr).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Start QR scanner' }));
  await user.click(screen.getByRole('button', { name: 'Scan synthetic QR' }));
  await user.click(await screen.findByRole('button', { name: 'Take synthetic photo' }));
  expect(screen.getByAltText('Your attendance photo for review')).toBeVisible();
  expect(confirm).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retake photo' }));
  await user.click(screen.getByRole('button', { name: 'Take synthetic photo' }));
  await user.click(screen.getByRole('button', { name: 'Confirm clock in' }));
  expect(confirm).toHaveBeenCalledWith({ qr, photo });
});

it.each([
  ['unrelated QR', null],
  [qr, new Error('QR does not match your store')],
])('refuses an invalid QR without taking a photo', async (value, failure) => {
  scanned = value;
  if (failure) verifyAttendanceQr.mockRejectedValueOnce(failure);
  const user = userEvent.setup();
  render(
    <AttendanceCapture
      verifyQr={verifyAttendanceQr}
      siteName="Main store"
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Start QR scanner' }));
  await user.click(screen.getByRole('button', { name: 'Scan synthetic QR' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Take synthetic photo' })).not.toBeInTheDocument();
});

it('discards QR verification that resolves after closing the dialog', async () => {
  let complete;
  verifyAttendanceQr.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const user = userEvent.setup();
  const confirm = vi.fn();
  const view = render(
    <AttendanceCapture
      verifyQr={verifyAttendanceQr}
      siteName="Main store"
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Start QR scanner' }));
  await user.click(screen.getByRole('button', { name: 'Scan synthetic QR' }));
  view.unmount();
  await act(async () => complete({ site_id: 'site' }));
  expect(confirm).not.toHaveBeenCalled();
});
