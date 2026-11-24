import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TargetEmployeeDocuments from '../features/documents/TargetEmployeeDocuments';
import * as authHook from '../hooks/useAuth';
import * as staffService from '../services/staffOnboardingService';
import * as payrollService from '../services/targetPayrollService';

describe('TargetEmployeeDocuments Component', () => {
  const mockDossier: staffService.StaffOnboardingDossier = {
    employeeId: 'emp-doc-test-1',
    employeeCode: 'EMP-HYD-PP-105',
    storeId: 'store-dev-01',
    storeName: 'Development Store',
    firstName: 'Tarun',
    lastName: 'Teja',
    fullName: 'Tarun Teja',
    dob: '1998-05-12',
    gender: 'Male',
    maritalStatus: 'Single',
    phone: '9876543210',
    email: 'tarun.teja@snrnest.local',
    emergencyContact: {
      name: 'Suresh Teja',
      relationship: 'Father',
      phone: '9876543219',
    },
    designation: 'picker_packer',
    dateOfJoining: '2024-05-01',
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-4819',
      aadharUploaded: true,
      panNumber: 'ABCDE4819F',
      panUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Tarun Teja',
      bankName: 'HDFC Bank',
      accountNumber: '50100492819283',
      ifscCode: 'HDFC0001234',
      passbookUploaded: true,
      passbookFileName: 'passbook_tarunteja.pdf',
    },
    salary: staffService.SALARY_TEMPLATES.picker_packer,
    status: 'active',
    createdAt: '2024-05-01T09:00:00Z',
  };

  beforeEach(() => {
    vi.spyOn(authHook, 'useAuth').mockReturnValue({
      session: {
        user_id: 'user-doc-test-1',
        email: 'tarun.teja@snrnest.local',
        display_name: 'Tarun Teja',
        role: 'employee',
      },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof authHook.useAuth>);

    vi.spyOn(staffService, 'getCurrentEmployeeDossier').mockReturnValue(mockDossier);
    vi.spyOn(payrollService, 'fetchMyPayslips').mockResolvedValue([]);
  });

  it('renders My Documents header and displays released monthly pay slips and letters', () => {
    render(<TargetEmployeeDocuments />);

    expect(screen.getByText(/My Documents & Pay Slips/i)).toBeInTheDocument();
    expect(screen.getByText(/Tarun Teja/i)).toBeInTheDocument();
    expect(screen.getByText('Salary Pay Slip — October 2026')).toBeInTheDocument();
    expect(screen.getByText('Official Employment Offer Letter')).toBeInTheDocument();
    expect(screen.getByText('Aadhar Card (Identity Proof)')).toBeInTheDocument();
  });

  it('filters documents by category', () => {
    render(<TargetEmployeeDocuments />);

    // Click Monthly Pay Slips filter pill
    const payslipsPill = screen.getByRole('button', { name: /Monthly Pay Slips/i });
    fireEvent.click(payslipsPill);

    expect(screen.getByText('Salary Pay Slip — October 2026')).toBeInTheDocument();
    expect(screen.getByText('Salary Pay Slip — September 2026')).toBeInTheDocument();
    // KYC doc should be filtered out
    expect(screen.queryByText('Aadhar Card (Identity Proof)')).not.toBeInTheDocument();
  });

  it('opens Document Preview modal when clicking View', () => {
    render(<TargetEmployeeDocuments />);

    const viewButtons = screen.getAllByRole('button', { name: /View/i });
    fireEvent.click(viewButtons[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/HR Verified & Tamper-Evident/i)).toBeInTheDocument();
    expect(screen.getByText(/Private S3 · Signed URL Access/i)).toBeInTheDocument();
  });

  it('opens Upload modal and uploads a new pay slip', async () => {
    render(<TargetEmployeeDocuments />);

    const uploadBtn = screen.getByRole('button', { name: /Upload Pay Slip \/ Document/i });
    fireEvent.click(uploadBtn);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Upload Pay Slip or Employment Document/i)).toBeInTheDocument();

    const titleInput = screen.getByLabelText(/Document Title \/ Period Name/i);
    fireEvent.change(titleInput, { target: { value: 'Salary Pay Slip — November 2026' } });

    // Simulate file input
    const file = new File(['dummy content'], 'payslip_nov_2026.pdf', { type: 'application/pdf' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    const submitBtn = screen.getByRole('button', { name: /Upload & Save Document/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Successfully uploaded "Salary Pay Slip — November 2026"/i),
      ).toBeInTheDocument();
    });
  });
});
