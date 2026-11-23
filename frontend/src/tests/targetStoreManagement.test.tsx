import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import TargetStoreManagement from '../features/workforce/TargetStoreManagement';
import {
  listStores,
  listStoreAdmins,
  createStore,
  createStoreAdmin,
} from '../services/targetWorkforceService';
import { useAuth } from '../hooks/useAuth';

vi.mock('../services/targetWorkforceService', () => ({
  listStores: vi.fn(),
  listStoreAdmins: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  createStoreAdmin: vi.fn(),
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: vi.fn(),
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

const mockAdmins = [
  {
    id: 'ra-1',
    user_id: 'u-1',
    email: 'admin@blr.example.org',
    display_name: 'Bangalore Manager',
    store_id: 'store-1',
    store_name: 'Bangalore Store',
    role: 'store_admin',
    active: true,
    created_at: '2026-11-23T00:00:00Z',
  },
];

describe('TargetStoreManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listStores).mockResolvedValue({ items: mockStores, total: 1 });
    vi.mocked(listStoreAdmins).mockResolvedValue({ items: mockAdmins, total: 1 });
    (useAuth as any).mockReturnValue({
      session: {
        user_id: 'sys-admin-id',
        actual_role: 'system_admin',
        scopes: [{ role: 'system_admin', organization_id: null, store_id: null }],
      },
    });
  });

  it('renders store list and store administrators for Super Admin', async () => {
    render(<TargetStoreManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
      expect(screen.getByText('CODE: BLR-01')).toBeInTheDocument();
      expect(screen.getByText('Bangalore Manager')).toBeInTheDocument();
      expect(screen.getByText('admin@blr.example.org')).toBeInTheDocument();
    });

    expect(screen.getByText('Add New Store')).toBeInTheDocument();
  });

  it('requires choosing store location on Google Maps before submitting', async () => {
    render(<TargetStoreManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add New Store'));

    expect(screen.getByText('Create New Store Location')).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/Store Code/i);
    const nameInput = screen.getByLabelText(/Store Name/i);

    fireEvent.change(codeInput, { target: { value: 'HYD-01' } });
    fireEvent.change(nameInput, { target: { value: 'Hyderabad Central' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Store' }));

    await waitFor(() => {
      expect(screen.getByText(/Please choose the store location on Google Maps/i)).toBeInTheDocument();
    });
    expect(createStore).not.toHaveBeenCalled();
  });

  it('allows Super Admin to open Add Store modal, pick coordinates, and submit', async () => {
    vi.mocked(createStore).mockResolvedValueOnce({
      id: 'store-2',
      organization_id: 'org-1',
      code: 'HYD-01',
      name: 'Hyderabad Central',
      timezone: 'Asia/Kolkata',
      latitude: 17.385,
      longitude: 78.4867,
      radius_meters: 50,
      active: true,
      created_at: '2026-11-23T00:00:00Z',
    });

    render(<TargetStoreManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add New Store'));

    expect(screen.getByText('Create New Store Location')).toBeInTheDocument();

    const codeInput = screen.getByLabelText(/Store Code/i);
    const nameInput = screen.getByLabelText(/Store Name/i);
    const latInput = screen.getByLabelText(/Latitude/i);
    const lngInput = screen.getByLabelText(/Longitude/i);

    fireEvent.change(codeInput, { target: { value: 'HYD-01' } });
    fireEvent.change(nameInput, { target: { value: 'Hyderabad Central' } });
    fireEvent.change(latInput, { target: { value: '17.3850' } });
    fireEvent.change(lngInput, { target: { value: '78.4867' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Store' }));

    await waitFor(() => {
      expect(createStore).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'HYD-01',
          name: 'Hyderabad Central',
          timezone: 'Asia/Kolkata',
          latitude: 17.385,
          longitude: 78.4867,
          radius_meters: 50,
        }),
      );
    });
  });

  it('allows Super Admin to open Add Store Admin modal and submit', async () => {
    vi.mocked(createStoreAdmin).mockResolvedValueOnce({
      id: 'ra-2',
      user_id: 'u-2',
      email: 'newmgr@blr.example.org',
      display_name: 'New Manager',
      store_id: 'store-1',
      store_name: 'Bangalore Store',
      role: 'store_admin',
      active: true,
      created_at: '2026-11-23T00:00:00Z',
    });

    render(<TargetStoreManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Admin/i }));

    expect(screen.getByText(/Add Store Admin: Bangalore Store/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Admin Full Name/i);
    const emailInput = screen.getByLabelText(/Admin Email Address/i);
    const passInput = screen.getByLabelText(/Temporary Password/i);

    fireEvent.change(nameInput, { target: { value: 'New Manager' } });
    fireEvent.change(emailInput, { target: { value: 'newmgr@blr.example.org' } });
    fireEvent.change(passInput, { target: { value: 'ManagerSecurePass123!' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Store Admin' }));

    await waitFor(() => {
      expect(createStoreAdmin).toHaveBeenCalledWith('store-1', {
        email: 'newmgr@blr.example.org',
        display_name: 'New Manager',
        password: 'ManagerSecurePass123!',
      });
    });
  });

  it('displays read-only notice for non-super admin roles', async () => {
    (useAuth as any).mockReturnValue({
      session: {
        user_id: 'hr-user-id',
        actual_role: 'hr_payroll',
        scopes: [{ role: 'hr_payroll', organization_id: 'org-1', store_id: null }],
      },
    });

    render(<TargetStoreManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Viewing stores in read-only mode/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Add New Store')).not.toBeInTheDocument();
  });
});
