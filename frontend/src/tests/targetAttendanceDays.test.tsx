import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TargetAttendanceDays from '../features/attendance/TargetAttendanceDays';
import * as targetAttendanceService from '../services/targetAttendanceService';
import { AttendanceDay, AttendanceAdjustment } from '../services/targetAttendanceService';

vi.mock('../services/targetAttendanceService', () => ({
  listAttendanceDays: vi.fn(),
  listMyAttendanceDays: vi.fn(),
  requestAttendanceAdjustment: vi.fn(),
  reviewAttendanceAdjustment: vi.fn(),
  listAttendanceAdjustments: vi.fn(),
  getAttendanceReportCsvUrl: vi.fn(() => '/api/v1/reports/attendance.csv'),
}));

const mockDay: AttendanceDay = {
  id: 'day-1',
  organization_id: 'org-1',
  store_id: 'store-1',
  employee_id: 'emp-1',
  employee_name: 'John Doe',
  employee_code: 'DEV001',
  work_date: '2026-11-23',
  shift_id: 'shift-1',
  first_in: '2026-11-23T09:15:00Z',
  last_out: '2026-11-23T18:00:00Z',
  payable_minutes: 525,
  status: 'present',
  is_missing_punch: false,
  is_late: true,
  is_early_departure: false,
  is_overtime: true,
  late_minutes: 15,
  early_departure_minutes: 0,
  overtime_minutes: 45,
  version: 1,
  created_at: '2026-11-23T09:15:00Z',
  updated_at: '2026-11-23T18:00:00Z',
};

const mockPendingAdj: AttendanceAdjustment = {
  id: 'adj-1',
  organization_id: 'org-1',
  attendance_day_id: 'day-1',
  before_json: { first_in: null, last_out: '2026-11-23T18:00:00Z' },
  after_json: { first_in: '2026-11-23T09:00:00Z', last_out: '2026-11-23T18:00:00Z' },
  reason: 'Clock-in camera failed, verified by guard',
  status: 'pending_approval',
  requested_by: 'user-admin',
  approved_by: null,
  review_note: null,
  created_at: '2026-11-23T10:00:00Z',
  reviewed_at: null,
};

describe('TargetAttendanceDays Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no days exist for employee', async () => {
    vi.mocked(targetAttendanceService.listMyAttendanceDays).mockResolvedValue({
      items: [],
      total: 0,
    });

    render(<TargetAttendanceDays role="employee" />);

    await waitFor(() => {
      expect(screen.getByText('No attendance day records found.')).toBeInTheDocument();
    });
  });

  it('renders attendance days with exception badges and payable hours', async () => {
    vi.mocked(targetAttendanceService.listMyAttendanceDays).mockResolvedValue({
      items: [mockDay],
      total: 1,
    });

    render(<TargetAttendanceDays role="employee" />);

    await waitFor(() => {
      expect(screen.getByText('8.8 hrs')).toBeInTheDocument();
      expect(screen.getByText('Late (15m)')).toBeInTheDocument();
      expect(screen.getByText('OT (+45m)')).toBeInTheDocument();
      expect(screen.getByText('present')).toBeInTheDocument();
    });
  });

  it('opens adjustment modal and validates required reason length', async () => {
    const user = userEvent.setup();
    vi.mocked(targetAttendanceService.listMyAttendanceDays).mockResolvedValue({
      items: [mockDay],
      total: 1,
    });

    render(<TargetAttendanceDays role="employee" />);

    await waitFor(() => {
      expect(screen.getByText('8.8 hrs')).toBeInTheDocument();
    });

    const adjustBtn = screen.getByRole('button', { name: /adjust/i });
    await user.click(adjustBtn);

    expect(screen.getByText(/adjust attendance for/i)).toBeInTheDocument();

    const reasonInput = screen.getByLabelText(/correction reason/i);
    await user.type(reasonInput, 'abc');

    const submitBtn = screen.getByRole('button', { name: 'Submit Adjustment' });
    await user.click(submitBtn);

    expect(
      screen.getByText('Please provide a descriptive reason of at least 5 characters.'),
    ).toBeInTheDocument();
  });

  it('submits adjustment request with optimistic version check', async () => {
    const user = userEvent.setup();
    vi.mocked(targetAttendanceService.listMyAttendanceDays).mockResolvedValue({
      items: [mockDay],
      total: 1,
    });
    vi.mocked(targetAttendanceService.requestAttendanceAdjustment).mockResolvedValue(
      mockPendingAdj,
    );

    render(<TargetAttendanceDays role="employee" />);

    await waitFor(() => {
      expect(screen.getByText('8.8 hrs')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /adjust/i }));

    const reasonInput = screen.getByLabelText(/correction reason/i);
    await user.type(reasonInput, 'Forgot badge, supervisor confirmed physical shift');

    await user.click(screen.getByRole('button', { name: 'Submit Adjustment' }));

    await waitFor(() => {
      expect(targetAttendanceService.requestAttendanceAdjustment).toHaveBeenCalledWith(
        'day-1',
        expect.objectContaining({
          reason: 'Forgot badge, supervisor confirmed physical shift',
          expected_version: 1,
        }),
      );
    });
  });

  it('renders pending adjustments for HR and reviews them', async () => {
    const user = userEvent.setup();
    vi.mocked(targetAttendanceService.listAttendanceDays).mockResolvedValue({
      items: [mockDay],
      total: 1,
    });
    vi.mocked(targetAttendanceService.listAttendanceAdjustments).mockResolvedValue([
      mockPendingAdj,
    ]);
    vi.mocked(targetAttendanceService.reviewAttendanceAdjustment).mockResolvedValue({
      ...mockPendingAdj,
      status: 'approved',
    });

    render(<TargetAttendanceDays role="hr_payroll" storeId="store-1" />);

    await waitFor(() => {
      expect(screen.getByText('Pending Attendance Corrections (1)')).toBeInTheDocument();
      expect(screen.getByText('Clock-in camera failed, verified by guard')).toBeInTheDocument();
    });

    const reviewBtn = screen.getByRole('button', { name: 'Review' });
    await user.click(reviewBtn);

    expect(screen.getByText('Review Attendance Correction Request')).toBeInTheDocument();

    const noteInput = screen.getByLabelText(/review notes/i);
    await user.type(noteInput, 'Verified with store manager');

    const approveBtn = screen.getByRole('button', { name: 'Approve Request' });
    await user.click(approveBtn);

    await waitFor(() => {
      expect(targetAttendanceService.reviewAttendanceAdjustment).toHaveBeenCalledWith(
        'adj-1',
        expect.objectContaining({
          action: 'approve',
          review_note: 'Verified with store manager',
        }),
      );
    });
  });
});
