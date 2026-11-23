import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import TargetStoreManagement from '../features/workforce/TargetStoreManagement';
import {
  listStores,
  getStore,
  createStore,
  updateStore,
  listStoreAdmins,
  listEmployees,
  listShifts,
  listAssignments,
} from '../services/targetWorkforceService';
import { useAuth } from '../hooks/useAuth';

vi.mock('../services/targetWorkforceService', () => ({
  listStores: vi.fn(),
  getStore: vi.fn(),
  createStore: vi.fn(),
  updateStore: vi.fn(),
  listStoreAdmins: vi.fn(),
  listEmployees: vi.fn(),
  listShifts: vi.fn(),
  listAssignments: vi.fn(),
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
    vi.mocked(getStore).mockResolvedValue(mockStores[0]);
    vi.mocked(listStoreAdmins).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(listEmployees).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(listShifts).mockResolvedValue({ items: [], total: 0 });
    vi.mocked(listAssignments).mockResolvedValue({ items: [], total: 0 });
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
      expect(screen.getByText(/Manage Store/i)).toBeInTheDocument();
    });

    expect(screen.getByText('Add New Store')).toBeInTheDocument();
  });

  it('clicking Manage Store opens the store hub with 6 option cards', async () => {
    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Store/i }));

    await waitFor(() => {
      expect(screen.getByText(/Back to All Stores/i)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Store Details & Location' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Manager Access' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Store Employees' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Shifts & Rosters' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Attendance QR Station' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Geofence Accuracy Tester' })).toBeInTheDocument();
    });
  });

  it('navigates to dedicated page for Shifts & Rostering and back to hub', async () => {
    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Store/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Shifts & Rosters' })).toBeInTheDocument();
    });

    // Click to enter dedicated Shifts & Rosters page
    fireEvent.click(screen.getByRole('button', { name: /Manage Shifts & Rosters/i }));

    await waitFor(() => {
      // 6 cards should be hidden
      expect(screen.queryByRole('heading', { name: 'Manager Access' })).not.toBeInTheDocument();
      // Dedicated page header & back button should be visible
      expect(screen.getByRole('heading', { name: 'Shifts & Rostering' })).toBeInTheDocument();
      expect(screen.getByText(/Back to Bangalore Store Hub/i)).toBeInTheDocument();
      expect(screen.getByText(/Configured Shifts/i)).toBeInTheDocument();
      expect(screen.getByText(/Active Employee Rosters/i)).toBeInTheDocument();
    });

    // Click back to hub
    fireEvent.click(screen.getByText(/Back to Bangalore Store Hub/i));

    await waitFor(() => {
      // 6 cards should be visible again
      expect(screen.getByRole('heading', { name: 'Store Details & Location' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Manager Access' })).toBeInTheDocument();
    });
  });

  it('navigates to dedicated page for Store Details & Location and back', async () => {
    render(
      <MemoryRouter>
        <TargetStoreManagement />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Bangalore Store')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Manage Store/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Store Details & Location' })).toBeInTheDocument();
    });

    // Click to enter dedicated Store Details page
    fireEvent.click(screen.getByRole('button', { name: /Edit Store Details/i }));

    await waitFor(() => {
      expect(screen.getByText(/Back to Bangalore Store Hub/i)).toBeInTheDocument();
      expect(screen.getByText(/Store Entrance Pin & Geofence Boundary/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    });
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
