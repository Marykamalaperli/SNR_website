import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import TargetStoreAdminManagement from '../features/workforce/TargetStoreAdminManagement';
import {
  listStores,
  listAllStoreAdmins,
  createStoreAdmin,
} from '../services/targetWorkforceService';
import { useAuth } from '../hooks/useAuth';

vi.mock('../services/targetWorkforceService', () => ({
  listStores: vi.fn(),
  listAllStoreAdmins: vi.fn(),
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
  {
    id: 'store-2',
    organization_id: 'org-1',
    code: 'HYD-01',
    name: 'Hyderabad Store',
    timezone: 'Asia/Kolkata',
    latitude: 17.385,
    longitude: 78.4867,
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

describe('TargetStoreAdminManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listStores).mockResolvedValue({ items: mockStores, total: 2 });
    vi.mocked(listAllStoreAdmins).mockResolvedValue({ items: mockAdmins, total: 1 });
    (useAuth as any).mockReturnValue({
      session: {
        user_id: 'sys-admin-id',
        actual_role: 'system_admin',
        scopes: [{ role: 'system_admin', organization_id: null, store_id: null }],
      },
    });
  });

  it('renders store administrator list with assigned store details', async () => {
    render(<TargetStoreAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Manager')).toBeInTheDocument();
      expect(screen.getByText('admin@blr.example.org')).toBeInTheDocument();
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
      expect(screen.getByText('store_admin')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Add Store Admin/i })).toBeInTheDocument();
  });

  it('allows Super Admin to open Add Store Admin modal and provision an account', async () => {
    vi.mocked(createStoreAdmin).mockResolvedValueOnce({
      id: 'ra-2',
      user_id: 'u-2',
      email: 'manager@hyd.example.org',
      display_name: 'Hyderabad Manager',
      store_id: 'store-2',
      store_name: 'Hyderabad Store',
      role: 'store_admin',
      active: true,
      created_at: '2026-11-23T00:00:00Z',
    });

    render(<TargetStoreAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Manager')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Add Store Admin/i }));

    expect(screen.getByText('Provision Store Administrator')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/Admin Full Name/i);
    const emailInput = screen.getByLabelText(/Admin Email Address/i);
    const passInput = screen.getByLabelText(/Temporary Password/i);

    fireEvent.change(nameInput, { target: { value: 'Hyderabad Manager' } });
    fireEvent.change(emailInput, { target: { value: 'manager@hyd.example.org' } });
    fireEvent.change(passInput, { target: { value: 'ManagerSecurePass123!' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create Store Admin' }));

    await waitFor(() => {
      expect(createStoreAdmin).toHaveBeenCalledWith('store-1', {
        display_name: 'Hyderabad Manager',
        email: 'manager@hyd.example.org',
        password: 'ManagerSecurePass123!',
      });
    });
  });

  it('filters store administrators by search query', async () => {
    render(<TargetStoreAdminManagement />);

    await waitFor(() => {
      expect(screen.getByText('Bangalore Manager')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name, email, store/i);
    fireEvent.change(searchInput, { target: { value: 'Nonexistent Person' } });

    expect(screen.queryByText('Bangalore Manager')).not.toBeInTheDocument();
    expect(screen.getByText(/No Store Administrators Found/i)).toBeInTheDocument();
  });
});
