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

const mockRun: PayrollRun = {
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

describe('TargetPayrollRuns Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SRS compliance watermark banner and empty state', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([]);

    render(<TargetPayrollRuns />);

    expect(screen.getByText('DRAFT - NOT FOR PAYMENT')).toBeInTheDocument();
    expect(
      screen.getByText(/Statutory, tax, deduction and overtime compliance rules/i),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('No draft payroll runs calculated yet.')).toBeInTheDocument();
    });
  });

  it('renders calculated draft run with hash and reconciliation amounts', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([mockPeriod]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([mockRun]);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockRun);

    render(<TargetPayrollRuns />);

    await waitFor(() => {
      expect(screen.getByText(/e3b0c44298fc1c14/)).toBeInTheDocument();
      expect(screen.getAllByText('₹ 4283.65').length).toBeGreaterThan(0);
      expect(screen.getAllByText('17.08 hrs').length).toBeGreaterThan(0);
    });
  });

  it('toggles detailed breakdown table with line items and verification check', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([mockPeriod]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([mockRun]);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockRun);

    render(<TargetPayrollRuns />);

    await waitFor(() => {
      expect(screen.getByText('View Breakdown')).toBeInTheDocument();
    });

    const viewButton = screen.getByText('View Breakdown');
    await userEvent.click(viewButton);

    await waitFor(() => {
      expect(screen.getByText('Alice Tester')).toBeInTheDocument();
      expect(screen.getByText('DEV001')).toBeInTheDocument();
      expect(screen.getByText('Deterministic Reconciliation Verified')).toBeInTheDocument();
      expect(screen.getByText('✓ 100% Match')).toBeInTheDocument();
    });
  });

  it('triggers deterministic calculation modal and initiates draft calculation', async () => {
    vi.mocked(targetPayrollService.fetchPayPeriods).mockResolvedValue([mockPeriod]);
    vi.mocked(targetPayrollService.fetchPayrollRuns).mockResolvedValue([]);
    vi.mocked(targetPayrollService.calculateDraftRun).mockResolvedValue(mockRun);
    vi.mocked(targetPayrollService.fetchPayrollRun).mockResolvedValue(mockRun);

    render(<TargetPayrollRuns />);

    await waitFor(() => {
      expect(screen.getByText('Calculate Draft Run')).toBeInTheDocument();
    });

    const calcButton = screen.getByText('Calculate Draft Run');
    await userEvent.click(calcButton);

    expect(screen.getByText('Calculate Deterministic Draft Run')).toBeInTheDocument();
    expect(screen.getByText(/Block on unresolved attendance exceptions/i)).toBeInTheDocument();

    const runEngineBtn = screen.getByText('Run Engine');
    await userEvent.click(runEngineBtn);

    await waitFor(() => {
      expect(targetPayrollService.calculateDraftRun).toHaveBeenCalledWith({
        pay_period_id: 'period-1',
        block_unresolved_exceptions: true,
      });
      expect(
        screen.getByText('Deterministic draft payroll calculated successfully.'),
      ).toBeInTheDocument();
    });
  });
});
