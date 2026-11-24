import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TargetEmployeeProfile from '../features/workforce/TargetEmployeeProfile';
import * as authHook from '../hooks/useAuth';
import * as staffService from '../services/staffOnboardingService';

describe('TargetEmployeeProfile Component', () => {
  const mockDossier: staffService.StaffOnboardingDossier = {
    employeeId: 'emp-test-01',
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
    previousEmployment: {
      companyName: 'Fulfillment Logistics India',
      designation: 'Fulfillment Associate',
      payslipsUploaded: { month1: true, month2: true, month3: true },
      offerLetterUploaded: true,
    },
    kycDocuments: {
      aadharNumber: 'XXXX-XXXX-4819',
      aadharUploaded: true,
      panNumber: 'ABCDE4819F',
      panUploaded: true,
      otherDocsUploaded: true,
    },
    bankDetails: {
      accountHolderName: 'Tarun Teja',
      bankName: 'HDFC Bank',
      branchName: 'Madhapur Branch, Hyderabad',
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
        user_id: 'user-test-01',
        email: 'tarun.teja@snrnest.local',
        display_name: 'Tarun Teja',
        role: 'employee',
      },
      loading: false,
      signIn: vi.fn(),
      signOut: vi.fn(),
    } as unknown as ReturnType<typeof authHook.useAuth>);

    vi.spyOn(staffService, 'getCurrentEmployeeDossier').mockReturnValue(mockDossier);
  });

  it('renders employee profile hero card with basic info tab active by default', () => {
    render(<TargetEmployeeProfile />);

    expect(screen.getByText('Tarun Teja')).toBeInTheDocument();
    expect(screen.getByText(/EMP-HYD-PP-105/)).toBeInTheDocument();
    expect(screen.getByText(/Active Employee/i)).toBeInTheDocument();
    expect(screen.getByText(/Personal Information & Demographics/i)).toBeInTheDocument();
    expect(screen.getByText('Suresh Teja')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('switches to Previous Experience tab and displays work history', () => {
    render(<TargetEmployeeProfile />);

    const expTab = screen.getByRole('button', { name: /Previous Experience/i });
    fireEvent.click(expTab);

    expect(screen.getByText('Fulfillment Logistics India')).toBeInTheDocument();
    expect(screen.getByText('Fulfillment Associate')).toBeInTheDocument();
    expect(screen.getByText(/Background Check Cleared/i)).toBeInTheDocument();
  });

  it('switches to Bank Details tab and opens Edit Bank Details modal', async () => {
    const updateSpy = vi.spyOn(staffService, 'updateEmployeeBankDetails').mockReturnValue({
      ...mockDossier,
      bankDetails: {
        ...mockDossier.bankDetails,
        accountHolderName: 'Tarun Teja Updated',
        bankName: 'State Bank of India',
        accountNumber: '60200492819283',
      },
    });

    render(<TargetEmployeeProfile />);

    const bankTab = screen.getByRole('button', { name: /Bank Details/i });
    fireEvent.click(bankTab);

    expect(screen.getByText('HDFC Bank')).toBeInTheDocument();
    expect(screen.getByText('HDFC0001234')).toBeInTheDocument();

    const editBtn = screen.getByRole('button', { name: /Edit Bank Details/i });
    expect(editBtn).toBeInTheDocument();
    fireEvent.click(editBtn);

    // Modal opens
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/Direct deposit account for payroll disbursement/i),
    ).toBeInTheDocument();

    // Fill form and save
    const holderInput = screen.getByLabelText(/Account Holder Name/i);
    fireEvent.change(holderInput, { target: { value: 'Tarun Teja Updated' } });

    const bankInput = screen.getByLabelText(/^Bank Name/i);
    fireEvent.change(bankInput, { target: { value: 'State Bank of India' } });

    const accInput = screen.getByLabelText(/^Account Number/i);
    fireEvent.change(accInput, { target: { value: '60200492819283' } });

    const confirmAccInput = screen.getByLabelText(/Confirm Account Number/i);
    fireEvent.change(confirmAccInput, { target: { value: '60200492819283' } });

    const submitBtn = screen.getByRole('button', { name: /Save & Update Bank Details/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(
        'emp-test-01',
        expect.objectContaining({
          accountHolderName: 'Tarun Teja Updated',
          bankName: 'State Bank of India',
          accountNumber: '60200492819283',
        }),
      );
      expect(screen.getByText(/Bank details updated successfully/i)).toBeInTheDocument();
    });
  });

  it('switches to Salary Structure tab and displays earnings & statutory deductions', () => {
    render(<TargetEmployeeProfile />);

    const salaryTab = screen.getByRole('button', { name: /Salary Structure/i });
    fireEvent.click(salaryTab);

    expect(screen.getByText(/Assigned Salary Structure & Compensation/i)).toBeInTheDocument();
    expect(screen.getByText('Basic Pay')).toBeInTheDocument();
    expect(screen.getByText('House Rent Allowance (HRA)')).toBeInTheDocument();
    expect(screen.getByText('Provident Fund (PF Employee)')).toBeInTheDocument();
  });

  it('switches to Documents tab and previews a document in the modal', () => {
    render(<TargetEmployeeProfile />);

    const docsTab = screen.getByRole('button', { name: /^Documents/i });
    fireEvent.click(docsTab);

    expect(screen.getByText(/Employee Document Repository & Dossier/i)).toBeInTheDocument();
    expect(screen.getByText('Aadhar Card')).toBeInTheDocument();
    expect(screen.getByText('Official Offer Letter')).toBeInTheDocument();
    expect(screen.getByText('Joining & Appointment Letter')).toBeInTheDocument();

    // Click View on Aadhar card
    const viewButtons = screen.getAllByRole('button', { name: /View/i });
    fireEvent.click(viewButtons[0]);

    // Modal preview appears
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/HR Verified & Encrypted/i)).toBeInTheDocument();
    expect(screen.getByText(/Private S3 · Signed URL Access/i)).toBeInTheDocument();
  });
});
