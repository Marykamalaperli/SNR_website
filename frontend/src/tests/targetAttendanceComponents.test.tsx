import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import StoreQRStation from '../features/attendance/StoreQRStation';
import TargetPunchCard from '../features/attendance/TargetPunchCard';
import TargetAttendanceHistory from '../features/attendance/TargetAttendanceHistory';
import * as targetAttendanceService from '../services/targetAttendanceService';

vi.mock('../services/targetAttendanceService', () => ({
  issueStoreQRChallenge: vi.fn(),
  requestPhotoUploadIntent: vi.fn(),
  uploadPhotoBlob: vi.fn(),
  recordAttendanceEvent: vi.fn(),
  listAttendanceEvents: vi.fn(),
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

describe('Target Attendance Components', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('StoreQRStation', () => {
    it('fetches and renders the live rotating QR challenge', async () => {
      vi.mocked(targetAttendanceService.issueStoreQRChallenge).mockResolvedValue({
        challenge_token: 'store1:1700000000:nonce:sig',
        store_id: 'store-1',
        expires_at: new Date(Date.now() + 60000).toISOString(),
      });

      render(<StoreQRStation storeId="store-1" storeName="Hyderabad Store" />);

      expect(screen.getByText(/Hyderabad Store · Live Attendance QR/i)).toBeInTheDocument();
      await waitFor(() => {
        expect(targetAttendanceService.issueStoreQRChallenge).toHaveBeenCalledWith('store-1');
        expect(screen.getByText('store1:1700000000:nonce:sig')).toBeInTheDocument();
      });
    });
  });

  describe('TargetPunchCard', () => {
    it('renders Clock In button when clocked out and opens modal', async () => {
      vi.mocked(targetAttendanceService.listAttendanceEvents).mockResolvedValue({
        items: [],
        total: 0,
      });

      render(<TargetPunchCard storeId="store-1" storeName="Hyderabad Store" latestEvent={null} />);

      await waitFor(() => {
        expect(screen.getByText('Clocked out')).toBeInTheDocument();
      });
      const punchButton = screen.getByRole('button', { name: /clock in/i });
      expect(punchButton).toBeInTheDocument();

      fireEvent.click(punchButton);
      expect(screen.getByText(/Step 1: Scan Store QR Challenge/i)).toBeInTheDocument();
    });

    it('renders Clock Out button when latest event is clock_in', async () => {
      const mockEvent = {
        id: 'evt-1',
        organization_id: 'org-1',
        store_id: 'store-1',
        employee_id: 'emp-1',
        shift_id: null,
        action: 'clock_in' as const,
        server_timestamp: '2026-11-23T08:00:00Z',
        store_timestamp: '2026-11-23T08:00:00Z',
        photo_key: 'photo.jpg',
      };
      vi.mocked(targetAttendanceService.listAttendanceEvents).mockResolvedValue({
        items: [mockEvent],
        total: 1,
      });

      render(
        <TargetPunchCard storeId="store-1" storeName="Hyderabad Store" latestEvent={mockEvent} />,
      );

      await waitFor(() => {
        expect(screen.getByText('Clocked in')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /clock out/i })).toBeInTheDocument();
    });
  });

  describe('TargetAttendanceHistory', () => {
    it('renders attendance history list from API', async () => {
      vi.mocked(targetAttendanceService.listAttendanceEvents).mockResolvedValue({
        items: [
          {
            id: 'evt-1',
            organization_id: 'org-1',
            store_id: '20000000-0000-4000-8000-000000000001',
            employee_id: 'emp-1',
            shift_id: null,
            action: 'clock_in',
            server_timestamp: '2026-11-23T08:00:00Z',
            store_timestamp: '2026-11-23T08:00:00Z',
            photo_key: 'photos/photo1.jpg',
          },
        ],
        total: 1,
      });

      render(<TargetAttendanceHistory employeeId="emp-1" />);

      await waitFor(() => {
        expect(targetAttendanceService.listAttendanceEvents).toHaveBeenCalled();
        expect(screen.getByText('Clock In')).toBeInTheDocument();
        expect(screen.getByText(/Verified Photo/i)).toBeInTheDocument();
      });
    });
  });
});
