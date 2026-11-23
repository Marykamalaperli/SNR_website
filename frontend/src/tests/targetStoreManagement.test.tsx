import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TargetStoreManagement from '../features/workforce/TargetStoreManagement';
import {
  listStores,
  createStore,
} from '../services/targetWorkforceService';
import { useAuth } from '../hooks/useAuth';

vi.mock('../services/targetWorkforceService', () => ({
  listStores: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
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

describe('TargetStoreManagement Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listStores).mockResolvedValue({ items: mockStores, total: 1 });
    (useAuth as any).mockReturnValue({
      session: {
        user_id: 'sys-admin-id',
        actual_role: 'system_admin',
        scopes: [{ role: 'system_admin', organization_id: null, store_id: null }],
      },
    });
  });

  it('renders store details and location info for Super Admin', async () => {
    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
      expect(screen.getByText('CODE: BLR-01')).toBeInTheDocument();
      expect(screen.getByText(/Asia\/Kolkata/i)).toBeInTheDocument();
      expect(screen.getByText(/12.9716, 77.5946/i)).toBeInTheDocument();
      expect(screen.getByText(/Manage Store Administrators/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Add New Store')).toBeInTheDocument();
  });

  it('requires choosing store location on Google Maps before submitting', async () => {
    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

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

    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

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

  it('displays read-only notice for non-super admin roles', async () => {
    (useAuth as any).mockReturnValue({
      session: {
        user_id: 'hr-user-id',
        actual_role: 'hr_payroll',
        scopes: [{ role: 'hr_payroll', organization_id: 'org-1', store_id: null }],
      },
    });

    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Viewing stores in read-only mode/i),
    ).toBeInTheDocument();
    expect(screen.queryByText('Add New Store')).not.toBeInTheDocument();
  });
});
