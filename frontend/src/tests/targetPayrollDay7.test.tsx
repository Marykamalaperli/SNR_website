import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TargetPayrollRuns from '../features/payroll/TargetPayrollRuns';
import * as targetPayrollService from '../services/targetPayrollService';
import { PayPeriod, PayrollRun } from '../services/targetPayrollService';

vi.mock('../services/targetPayrollService', () => ({
  fetchPayPeriods: vi.fn(),
  createPayPeriod: vi.fn(),
  fetchPayrollConfigurations: vi.fn(),
  createPayrollConfiguration: vi.fn(),
  calculateDraftRun: vi.fn(),
  fetchPayrollRuns: vi.fn(),
  fetchPayrollRun: vi.fn(),
  fetchPayrollRunPreview: vi.fn(),
  approvePayrollRun: vi.fn(),
  releasePayrollRun: vi.fn(),
  reversePayrollRun: vi.fn(),
  fetchMyPayslips: vi.fn(),
  createPayslipDownloadIntent: vi.fn(),
  getPayrollReportCsvUrl: vi.fn(() => '/api/v1/reports/payroll.csv'),
}));

const mockPeriod: PayPeriod = {
  id: 'period-1',
  organization_id: 'org-1',
  name: 'November 2026 - First Half',
  start_date: '2026-11-01',
  end_date: '2026-11-15',
  cutoff_date: '2026-11-16',
  status: 'open',
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
};

const mockDraftRun: PayrollRun = {
  id: 'run-1',
  organization_id: 'org-1',
  store_id: null,
  pay_period_id: 'period-1',
  version: 1,
  status: 'draft',
  watermark: 'Draft - Not for payment',
  input_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  total_gross_pay: '4283.65',
  total_net_pay: '4283.65',
  total_payable_minutes: 1025,
  total_employees: 1,
  created_at: '2026-11-16T10:00:00Z',
  locked_at: null,
  items: [
    {
      id: 'item-1',
      payroll_run_id: 'run-1',
      employee_id: 'emp-1',
      employee_code: 'DEV001',
      employee_name: 'Alice Tester',
      payable_minutes: 1025,
      hourly_rate: '250.75',
      gross_pay: '4283.65',
      net_pay: '4283.65',
      earnings_json: [
        { component: 'Base Hourly Pay', hours: '17.08', rate: '250.75', amount: '4283.65' },
      ],
      deductions_json: [],
      unresolved_exceptions_count: 0,
      watermark: 'Draft - Not for payment',
      created_at: '2026-11-16T10:00:00Z',
    },
  ],
};

const mockLockedRun: PayrollRun = {
  ...mockDraftRun,
  status: 'locked',
  locked_at: '2026-11-16T11:00:00Z',
};

describe('TargetPayrollRuns Day 7 - Approval and Release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('approves and locks draft run transactionally', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([mockPeriod]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([mockDraftRun]);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockDraftRun);
    vi.mocked(targetPayrollService.approvePayrollRun).mockResolvedValue(mockLockedRun);

    render(<TargetPayrollRuns />);

    await waitFor(() => {
      expect(screen.getByText('View Breakdown')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('View Breakdown'));

    await waitFor(() => {
      expect(screen.getByText('Approve & Lock Run')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Approve & Lock Run'));

    await waitFor(() => {
      expect(targetPayrollService.approvePayrollRun).toHaveBeenCalledWith(
        'run-1',
        'Approved by authorized HR staff',
      );
      expect(screen.getByText(/Payroll run successfully approved and locked/i)).toBeInTheDocument();
    });
  });

  it('releases private payslips for locked run', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([mockPeriod]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([mockLockedRun]);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockLockedRun);
    vi.mocked(targetPayrollService.releasePayrollRun).mockResolvedValue([
      {
        id: 'ps-1',
        organization_id: 'org-1',
        payroll_run_id: 'run-1',
        payroll_item_id: 'item-1',
        employee_id: 'emp-1',
        period_name: 'November 2026 - First Half',
        gross_pay: '4283.65',
        net_pay: '4283.65',
        currency: 'INR',
        status: 'released',
        released_at: '2026-11-16T12:00:00Z',
        created_at: '2026-11-16T11:00:00Z',
      },
    ]);

    render(<TargetPayrollRuns />);

    await waitFor(() => {
      expect(screen.getByText('Locked & Immutable')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('View Breakdown'));

    await waitFor(() => {
      expect(screen.getByText('Release Private Payslips')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText('Release Private Payslips'));

    await waitFor(() => {
      expect(targetPayrollService.releasePayrollRun).toHaveBeenCalledWith('run-1');
      expect(screen.getByText(/Successfully released 1 payslips/i)).toBeInTheDocument();
    });
  });
});
