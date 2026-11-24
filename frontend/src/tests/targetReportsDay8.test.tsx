import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TargetAttendanceDays from '../features/attendance/TargetAttendanceDays';
import TargetPayrollRuns from '../features/payroll/TargetPayrollRuns';
import * as targetAttendanceService from '../services/targetAttendanceService';
import * as targetPayrollService from '../services/targetPayrollService';

vi.mock('../services/targetAttendanceService', async (importOriginal) => {
  const actual = await importOriginal<typeof targetAttendanceService>();
  return {
    ...actual,
    listAttendanceDays: vi.fn(),
    listMyAttendanceDays: vi.fn(),
    listAttendanceAdjustments: vi.fn(),
    getAttendanceReportCsvUrl: vi.fn(
      ({ from_date, to_date }) =>
        `http://localhost:8000/api/v1/reports/attendance.csv?from_date=${from_date}&to_date=${to_date}`,
    ),
  };
});

vi.mock('../services/targetPayrollService', async (importOriginal) => {
  const actual = await importOriginal<typeof targetPayrollService>();
  return {
    ...actual,
    fetchPayPeriods: vi.fn(),
    fetchPayrollRuns: vi.fn(),
    fetchPayrollRun: vi.fn(),
    getPayrollReportCsvUrl: vi.fn(
      (runId) => `http://localhost:8000/api/v1/reports/payroll.csv?payroll_run_id=${runId}`,
    ),
  };
});

describe('Day 8 Reports Engine & PWA Polish UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Export CSV link for Store Admin and HR roles, but hides it for Employee', async () => {
    vi.mocked(targetAttendanceService.listAttendanceDays).mockResolvedValue({
      items: [
        {
          id: 'day-1',
          organization_id: 'org-1',
          store_id: 'store-1',
          employee_id: 'emp-1',
          employee_name: 'Tarun Kumar',
          employee_code: 'EMP001',
          work_date: '2026-11-20',
          first_in: '2026-11-20T09:00:00Z',
          last_out: '2026-11-20T17:30:00Z',
          payable_minutes: 510,
          is_missing_punch: false,
          is_late: false,
          is_early_departure: false,
          is_overtime: false,
          status: 'present',
          version: 1,
        } as any,
      ],
      total: 1,
    });
    vi.mocked(targetAttendanceService.listAttendanceAdjustments).mockResolvedValue([]);

    // 1. Store Admin sees Export CSV
    const { unmount } = render(<TargetAttendanceDays role="store_admin" storeId="store-1" />);
    await waitFor(() => {
      expect(screen.getByText('Tarun Kumar')).toBeInTheDocument();
    });
    const exportBtn = screen.getByRole('link', { name: /export csv/i });
    expect(exportBtn).toBeInTheDocument();
    expect(exportBtn).toHaveAttribute('href', expect.stringContaining('/reports/attendance.csv'));
    unmount();

    // 2. Employee does NOT see Export CSV
    vi.mocked(targetAttendanceService.listMyAttendanceDays).mockResolvedValue({
      items: [
        {
          id: 'day-1',
          organization_id: 'org-1',
          store_id: 'store-1',
          employee_id: 'emp-1',
          work_date: '2026-11-20',
          first_in: '2026-11-20T09:00:00Z',
          last_out: '2026-11-20T17:30:00Z',
          payable_minutes: 510,
          is_missing_punch: false,
          is_late: false,
          is_early_departure: false,
          is_overtime: false,
          status: 'present',
          version: 1,
        } as any,
      ],
      total: 1,
    });

    render(<TargetAttendanceDays role="employee" />);
    await waitFor(() => {
      expect(screen.getByText('My Daily Attendance & Exceptions')).toBeInTheDocument();
    });
    expect(screen.queryByRole('link', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('renders Export CSV button on selected locked payroll run with watermark notice', async () => {
    const mockRun: any = {
      id: 'run-1234',
      organization_id: 'org-1',
      pay_period_id: 'period-1',
      status: 'locked',
      total_gross_pay: '25000.00',
      total_net_pay: '25000.00',
      total_payable_minutes: 10200,
      total_employees: 5,
      watermark: 'Draft - Not for payment',
      input_hash: 'a1b2c3d4e5f6789012345678abcdef',
      created_at: '2026-11-20T10:00:00Z',
      updated_at: '2026-11-20T11:00:00Z',
      items: [
        {
          id: 'item-1',
          payroll_run_id: 'run-1234',
          employee_id: 'emp-1',
          employee_code: 'EMP001',
          employee_name: 'Tarun Kumar',
          currency: 'INR',
          hourly_rate: '200.00',
          base_pay: '25000.00',
          gross_pay: '25000.00',
          total_deductions: '0.00',
          net_pay: '25000.00',
          payable_minutes: 10200,
          days_worked: 20,
          exceptions_count: 0,
          calculation_metadata: {},
        },
      ],
    };

    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([mockRun]);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockRun);

    render(<TargetPayrollRuns />);
    await waitFor(() => {
      expect(screen.getByText('Payroll Runs')).toBeInTheDocument();
    });

    // Click "View Breakdown" to select the run
    const viewBtn = screen.getByRole('button', { name: /view breakdown/i });
    viewBtn.click();

    await waitFor(() => {
      expect(screen.getByText('Run Line Items & Reconciliation')).toBeInTheDocument();
    });

    const exportCsvLink = screen.getByRole('link', { name: /export csv/i });
    expect(exportCsvLink).toBeInTheDocument();
    expect(exportCsvLink).toHaveAttribute(
      'href',
      expect.stringContaining('payroll_run_id=run-1234'),
    );
  });
});
