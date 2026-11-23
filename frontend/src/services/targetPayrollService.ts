import { getApiBaseUrl } from '../lib/apiClient';

export interface PayPeriod {
  id: string;
  organization_id: string;
  name: string;
  start_date: string;
  end_date: string;
  cutoff_date: string;
  status: 'open' | 'locked' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface PayrollConfig {
  id: string;
  organization_id: string;
  employee_id: string;
  hourly_rate: string | number;
  daily_rate?: string | number | null;
  effective_from: string;
  effective_until?: string | null;
  created_at: string;
}

export interface PayrollItem {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  payable_minutes: number;
  hourly_rate: string | number;
  gross_pay: string | number;
  net_pay: string | number;
  earnings_json: Array<{ component: string; hours: string; rate: string; amount: string }>;
  deductions_json: Array<Record<string, unknown>>;
  unresolved_exceptions_count: number;
  watermark: string;
  created_at: string;
}

export interface PayrollRun {
  id: string;
  organization_id: string;
  store_id?: string | null;
  pay_period_id: string;
  version: number;
  status: 'draft' | 'locked' | 'reversed' | 'cancelled';
  watermark: string;
  input_hash: string;
  total_gross_pay: string | number;
  total_net_pay: string | number;
  total_payable_minutes: number;
  total_employees: number;
  created_at: string;
  locked_at?: string | null;
  items?: PayrollItem[];
}

export interface PayrollRunPreview {
  id: string;
  organization_id: string;
  pay_period_id: string;
  status: string;
  watermark: string;
  input_hash: string;
  total_gross_pay: string | number;
  total_net_pay: string | number;
  total_payable_minutes: number;
  total_employees: number;
  unresolved_exceptions_total: number;
  reconciles: boolean;
  blockers: string[];
}

export interface Payslip {
  id: string;
  organization_id: string;
  payroll_run_id: string;
  payroll_item_id: string;
  employee_id: string;
  period_name: string;
  gross_pay: string | number;
  net_pay: string | number;
  currency: string;
  status: 'generated' | 'released' | 'cancelled';
  released_at?: string | null;
  created_at: string;
}

export interface PayslipDownloadIntent {
  payslip_id: string;
  download_url: string;
  expires_at: string;
  filename: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    let errorDetail = 'Payroll request failed';
    try {
      const data = await res.json();
      errorDetail = data.detail || (data.error && data.error.message) || data.message || errorDetail;
    } catch {
      errorDetail = `HTTP ${res.status} ${res.statusText}`;
    }
    throw new Error(errorDetail);
  }

  return res.json();
}

export async function fetchPayPeriods(): Promise<PayPeriod[]> {
  return request<PayPeriod[]>('/api/v1/payroll/pay-periods');
}

export async function createPayPeriod(data: {
  name: string;
  start_date: string;
  end_date: string;
  cutoff_date: string;
}): Promise<PayPeriod> {
  return request<PayPeriod>('/api/v1/payroll/pay-periods', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function fetchPayrollConfigurations(employeeId?: string): Promise<PayrollConfig[]> {
  const query = employeeId ? `?employee_id=${employeeId}` : '';
  return request<PayrollConfig[]>(`/api/v1/payroll/configurations${query}`);
}

export async function createPayrollConfiguration(data: {
  employee_id: string;
  hourly_rate: number | string;
  daily_rate?: number | string | null;
  effective_from: string;
  effective_until?: string | null;
}): Promise<PayrollConfig> {
  return request<PayrollConfig>('/api/v1/payroll/configurations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function calculateDraftRun(data: {
  pay_period_id: string;
  store_id?: string | null;
  block_unresolved_exceptions?: boolean;
}): Promise<PayrollRun> {
  return request<PayrollRun>('/api/v1/payroll/runs/calculate-draft', {
    method: 'POST',
    body: JSON.stringify({
      pay_period_id: data.pay_period_id,
      store_id: data.store_id || null,
      block_unresolved_exceptions: data.block_unresolved_exceptions ?? true,
    }),
  });
}

export async function fetchPayrollRuns(payPeriodId?: string): Promise<PayrollRun[]> {
  const query = payPeriodId ? `?pay_period_id=${payPeriodId}` : '';
  return request<PayrollRun[]>(`/api/v1/payroll/runs${query}`);
}

export async function fetchPayrollRun(runId: string): Promise<PayrollRun> {
  return request<PayrollRun>(`/api/v1/payroll/runs/${runId}`);
}

export async function fetchPayrollRunPreview(runId: string): Promise<PayrollRunPreview> {
  return request<PayrollRunPreview>(`/api/v1/payroll/runs/${runId}/preview`);
}

// Day 7 Functions
export async function validatePayrollRun(runId: string): Promise<PayrollRunPreview> {
  return request<PayrollRunPreview>(`/api/v1/payroll/runs/${runId}/validate`, {
    method: 'POST',
  });
}

export async function approvePayrollRun(runId: string, notes?: string): Promise<PayrollRun> {
  return request<PayrollRun>(`/api/v1/payroll/runs/${runId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ notes: notes || null }),
  });
}

export async function releasePayrollRun(runId: string): Promise<Payslip[]> {
  return request<Payslip[]>(`/api/v1/payroll/runs/${runId}/release`, {
    method: 'POST',
  });
}

export async function reversePayrollRun(runId: string, reason: string): Promise<PayrollRun> {
  return request<PayrollRun>(`/api/v1/payroll/runs/${runId}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function fetchMyPayslips(): Promise<Payslip[]> {
  return request<Payslip[]>('/api/v1/payslips/me');
}

export async function createPayslipDownloadIntent(payslipId: string): Promise<PayslipDownloadIntent> {
  return request<PayslipDownloadIntent>(`/api/v1/payslips/${payslipId}/download-intent`, {
    method: 'POST',
  });
}

export function getPayrollReportCsvUrl(payrollRunId: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}/api/v1/reports/payroll.csv?payroll_run_id=${encodeURIComponent(payrollRunId)}`;
}
