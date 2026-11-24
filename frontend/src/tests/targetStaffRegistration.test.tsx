import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TargetStaffRegistrationWizard from '../features/workforce/TargetStaffRegistrationWizard';
import TargetStoreOrgStructure from '../features/workforce/TargetStoreOrgStructure';
import {
  listStores,
  createEmployee,
  listStoreAdmins,
  listAllStoreAdmins,
  listEmployees,
} from '../services/targetWorkforceService';
import {
  SALARY_TEMPLATES,
  STORE_ROLE_DEFINITIONS,
  getOnboardingDossiers,
} from '../services/staffOnboardingService';

vi.mock('../services/targetWorkforceService', () => ({
  listStores: vi.fn(),
  createEmployee: vi.fn(),
  listStoreAdmins: vi.fn(),
  listAllStoreAdmins: vi.fn(),
  listEmployees: vi.fn(),
}));

const mockStores = [
  {
    id: 'store-1',
    organization_id: 'org-1',
    code: 'BLR-01',
    name: 'Bangalore Store',
    timezone: 'Asia/Kolkata',
    latitude: 12.9716,
    longitude: 77.5946,
    radius_meters: 50,
    active: true,
    created_at: '2026-11-23T00:00:00Z',
  },
];

describe('TargetStaffRegistrationWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class MockFileReader {
      onload: ((e: any) => void) | null = null;
      readAsDataURL() {
        setTimeout(() => {
          if (this.onload) {
            this.onload({ target: { result: 'data:image/png;base64,dummyphotodata' } });
          }
        }, 0);
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);

    vi.mocked(listStores).mockResolvedValue({ items: mockStores, total: 1 });
    vi.mocked(createEmployee).mockResolvedValue({
      id: 'new-emp-1',
      organization_id: 'org-1',
      home_store_id: 'store-1',
      user_id: null,
      employee_code: 'EMP-BLR-01-PP-501',
      display_name: 'Anil Kumar',
      status: 'active',
      hire_date: '2026-11-23',
      exit_date: null,
      login_email: 'anil.kumar@example.com',
      temporary_password: 'SNR@EMP-BLR-01-PP-501',
    });
  });

  it('renders Step 1 with personal details, demographics, live photo, and emergency contact', async () => {
    render(
      <MemoryRouter>
        <TargetStaffRegistrationWizard initialStoreId="store-1" />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Step 1: Personal Details & Live Photo/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Last Name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date of Birth/i)).toBeInTheDocument();
    expect(screen.getByText(/Mandatory Live Candidate Photo/i)).toBeInTheDocument();
    expect(screen.getByText(/Emergency Contact Details/i)).toBeInTheDocument();
    expect(screen.getByText(/Continue to Role & Store/i)).toBeInTheDocument();
  });

  it('validates Step 1 requirements before allowing continuation', async () => {
    render(
      <MemoryRouter>
        <TargetStaffRegistrationWizard initialStoreId="store-1" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText(/Continue to Role & Store/i));

    await waitFor(() => {
      expect(screen.getByText(/First Name and Last Name are required/i)).toBeInTheDocument();
    });
  });

  it('progresses through all 6 steps and registers employee with salary template', async () => {
    const onCompleteMock = vi.fn();

    render(
      <MemoryRouter>
        <TargetStaffRegistrationWizard initialStoreId="store-1" onComplete={onCompleteMock} />
      </MemoryRouter>,
    );

    // Step 1: Personal Details
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Anil' } });
    fireEvent.change(screen.getByLabelText(/Last Name/i), { target: { value: 'Kumar' } });
    fireEvent.change(screen.getByLabelText(/Primary Phone Number/i), { target: { value: '9876543210' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'anil.kumar@snr.com' } });
    fireEvent.change(screen.getByLabelText(/Contact Person Name/i), { target: { value: 'Sunita Kumar' } });
    fireEvent.change(screen.getByLabelText(/Emergency Phone/i), { target: { value: '9876543211' } });

    // Mock photo upload
    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement;
    if (fileInput) {
      const file = new File(['dummy photo'], 'selfie.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [file] } });
    }

    await waitFor(() => {
      expect(screen.getByAltText(/Candidate live capture/i)).toBeInTheDocument();
    });

    // Force step 2 progression after validation passes
    fireEvent.click(screen.getByText(/Continue to Role & Store/i));

    await waitFor(() => {
      expect(screen.getByText(/Step 2: Designation, Store & Role Assignment/i)).toBeInTheDocument();
    });

    // Step 2: Role & Store
    expect(screen.getByText(/Bangalore Store/i)).toBeInTheDocument();
    expect(screen.getByText(/Authorizations & Scope/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Continue to KYC & Verification/i));

    // Step 3: KYC Documents
    await waitFor(() => {
      expect(screen.getByText(/Step 3: Verification, Previous Employment & KYC Documents/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Aadhar Card Number/i), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText(/PAN Card Number/i), { target: { value: 'ABCDE1234F' } });

    fireEvent.click(screen.getByText(/Continue to Bank Details/i));

    // Step 4: Bank Details
    await waitFor(() => {
      expect(screen.getByText(/Step 4: Bank Account & Payment Details/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/Account Holder Name/i), { target: { value: 'Anil Kumar' } });
    fireEvent.change(screen.getByLabelText(/^Bank Account Number/i), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(/Confirm Bank Account Number/i), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(/IFSC Code/i), { target: { value: 'SBIN0001234' } });

    fireEvent.click(screen.getByText(/Continue to Salary Structure/i));

    // Step 5: Salary Structure
    await waitFor(() => {
      expect(screen.getByText(/Step 5: Salary Structure & Compensation Template/i)).toBeInTheDocument();
      expect(screen.getByText(/Draft - Not for payment/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Basic Pay/i)).toBeInTheDocument();
    expect(screen.getByText(/Gross Monthly CTC/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimated Net In-Hand/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Continue to Review & Confirm/i));

    // Step 6: Review & Final Submit
    await waitFor(() => {
      expect(screen.getByText(/Step 6: Review Candidate Dossier & Confirm Registration/i)).toBeInTheDocument();
      expect(screen.getByText('Anil Kumar')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm & Register Employee/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Register Employee/i }));

    await waitFor(() => {
      expect(createEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          display_name: 'Anil Kumar',
          home_store_id: 'store-1',
          status: 'active',
          email: 'anil.kumar@snr.com',
        }),
      );
      expect(screen.getByText(/Staff Registration Successful/i)).toBeInTheDocument();
      expect(screen.getByText(/Portal Login Credentials Generated/i)).toBeInTheDocument();
      expect(screen.getByText(/SNR@EMP-BLR-01-PP-501/i)).toBeInTheDocument();
      expect(screen.getByText(/Copy Onboarding Slip/i)).toBeInTheDocument();
    });
  });
});

describe('TargetStoreOrgStructure Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listStores).mockResolvedValue({ items: mockStores, total: 1 });
    vi.mocked(listAllStoreAdmins).mockResolvedValue({
      items: [
        {
          id: 'admin-1',
          user_id: 'u-1',
          store_id: 'store-1',
          store_name: 'Bangalore Store',
          email: 'admin@blr.com',
          display_name: 'Bangalore Admin',
          role: 'store_admin',
          active: true,
          created_at: '2026-11-23T00:00:00Z',
        },
      ],
      total: 1,
    });
    vi.mocked(listEmployees).mockResolvedValue({
      items: [
        {
          id: 'emp-1',
          organization_id: 'org-1',
          home_store_id: 'store-1',
          user_id: null,
          employee_code: 'EMP-BLR-01-SM-101',
          display_name: 'Raghav Sharma',
          status: 'active',
          hire_date: '2024-01-15',
          exit_date: null,
        },
      ],
      total: 1,
    });
  });

  it('renders the store organizational structure tree with all levels', async () => {
    render(
      <MemoryRouter>
        <TargetStoreOrgStructure />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Store Organizational Structure & Roles/i)).toBeInTheDocument();
      expect(screen.getByText(/Super Admin & Central People Operations/i)).toBeInTheDocument();
      expect(screen.getByText(/Store Administrator \(Store Admin\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Store Manager \(SM\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Assistant Store Manager \(ASM\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Team Lead \(TL\)/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Associate \(Picker & Packer\)/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Security Guard & Watchman/i).length).toBeGreaterThan(0);
    });

    expect(screen.getByRole('button', { name: /Register Staff \(5-Step Wizard\)/i })).toBeInTheDocument();

    // Verify clicking a Teams card opens the Microsoft Teams Profile & Dossier Drawer
    const personCards = screen.getAllByTestId('teams-person-card');
    expect(personCards.length).toBeGreaterThan(0);
    fireEvent.click(personCards[0]);

    await waitFor(() => {
      expect(screen.getByText(/Overview/i)).toBeInTheDocument();
      expect(screen.getByText(/Permissions/i)).toBeInTheDocument();
      expect(screen.getByText(/KYC & Verification/i)).toBeInTheDocument();
      expect(screen.getByText(/Compensation/i)).toBeInTheDocument();
    });

    // Close the profile drawer
    fireEvent.click(screen.getByRole('button', { name: /Close/i }));

    // Switch to Teams & Pods view
    fireEvent.click(screen.getByRole('button', { name: /Teams & Pods/i }));
    await waitFor(() => {
      expect(screen.getByText(/Store Executive & Managerial Pod/i)).toBeInTheDocument();
      expect(screen.getByText(/Floor Operations & Order Fulfillment Pod/i)).toBeInTheDocument();
      expect(screen.getByText(/Facility Safety & Gate Security Pod/i)).toBeInTheDocument();
    });
  });
});
