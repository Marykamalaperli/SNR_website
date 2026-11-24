import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Globe,
  LocateFixed,
  Mail,
  MapPin,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  Network,
  X,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import { EmptyState, LoadingState } from '../../components/common/States';
import StatusBadge from '../../components/common/StatusBadge';
import FormField from '../../components/forms/FormField';
import { useAuth } from '../../hooks/useAuth';
import GoogleMapLocationPicker from './GoogleMapLocationPicker';
import TargetStaffRegistrationWizard from './TargetStaffRegistrationWizard';
import {
  getOnboardingDossiers,
  STORE_ROLE_DEFINITIONS,
} from '../../services/staffOnboardingService';
import {
  createAssignment,
  createEmployee,
  createShift,
  createStoreAdmin,
  Employee,
  getStore,
  listAssignments,
  listEmployees,
  listShifts,
  listStoreAdmins,
  Shift,
  ShiftAssignment,
  Store,
  StoreAdmin,
  updateStore,
} from '../../services/targetWorkforceService';

interface TargetStoreHubProps {
  storeId: string;
  onBack: () => void;
}

export type ActiveSection =
  'none' | 'details' | 'admins' | 'employees' | 'shifts' | 'attendance' | 'geofence';

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export default function TargetStoreHub({ storeId, onBack }: TargetStoreHubProps) {
  const { session } = useAuth() as { session: any };
  const [searchParams, setSearchParams] = useSearchParams();

  // Active section tracked via URL search param
  const urlSection = (searchParams.get('section') as ActiveSection) || 'none';
  const [activeSection, setActiveSection] = useState<ActiveSection>(urlSection);

  useEffect(() => {
    const s = (searchParams.get('section') as ActiveSection) || 'none';
    setActiveSection(s);
  }, [searchParams]);

  function goToSection(section: ActiveSection) {
    setActiveSection(section);
    const next = new URLSearchParams(searchParams);
    if (section === 'none') {
      next.delete('section');
    } else {
      next.set('section', section);
    }
    setSearchParams(next);
  }

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showStaffWizard, setShowStaffWizard] = useState(false);

  // Store data collections
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  // Modals state
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showCreateShiftModal, setShowCreateShiftModal] = useState(false);
  const [showAssignRosterModal, setShowAssignRosterModal] = useState(false);

  // Edit Store Form (used directly in the dedicated details page)
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [editMapLink, setEditMapLink] = useState('');
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [editRadius, setEditRadius] = useState('50');
  const [editActive, setEditActive] = useState(true);

  // Add Admin Form
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Add Employee Form
  const [empCode, setEmpCode] = useState('');
  const [empName, setEmpName] = useState('');
  const [empHireDate, setEmpHireDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Create Shift Form
  const [shiftCode, setShiftCode] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('09:00:00');
  const [shiftEnd, setShiftEnd] = useState('18:00:00');
  const [shiftBreak, setShiftBreak] = useState('60');
  const [shiftOvernight, setShiftOvernight] = useState(false);

  // Assign Roster Form
  const [rosterEmpId, setRosterEmpId] = useState('');
  const [rosterShiftId, setRosterShiftId] = useState('');
  const [rosterFrom, setRosterFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [rosterUntil, setRosterUntil] = useState(() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return nextMonth.toISOString().slice(0, 10);
  });

  // Geofence tester state
  const [testingGps, setTestingGps] = useState(false);
  const [gpsTestResult, setGpsTestResult] = useState<{
    distance: number;
    inside: boolean;
    accuracy: number;
    userLat?: number;
    userLng?: number;
  } | null>(null);

  const isSuperAdmin = Boolean(
    session?.actual_role === 'system_admin' ||
    session?.role === 'system_admin' ||
    session?.role === 'admin' ||
    session?.scopes?.some((s: { role: string }) => s.role === 'system_admin'),
  );

  async function loadStoreHubData() {
    setLoading(true);
    setError(null);
    try {
      const storeData = await getStore(storeId);
      setStore(storeData);

      // Prepopulate edit form
      setEditName(storeData.name);
      setEditTimezone(storeData.timezone || 'Asia/Kolkata');
      setEditLatitude(
        storeData.latitude !== undefined && storeData.latitude !== null
          ? String(storeData.latitude)
          : '',
      );
      setEditLongitude(
        storeData.longitude !== undefined && storeData.longitude !== null
          ? String(storeData.longitude)
          : '',
      );
      setEditRadius(storeData.radius_meters ? String(storeData.radius_meters) : '50');
      setEditActive(storeData.active);

      // Load store-scoped relations
      const [adminsRes, empRes, shiftsRes, asgnRes] = await Promise.all([
        listStoreAdmins(storeId).catch(() => ({ items: [], total: 0 })),
        listEmployees({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
        listShifts({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
        listAssignments({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
      ]);

      setAdmins(adminsRes.items);
      setEmployees(empRes.items);
      setShifts(shiftsRes.items);
      setAssignments(asgnRes.items);
      if (empRes.items.length > 0) setRosterEmpId(empRes.items[0].id);
      if (shiftsRes.items.length > 0) setRosterShiftId(shiftsRes.items[0].id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load store management hub data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStoreHubData();
  }, [storeId]);

  async function handleUpdateStore(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) {
      setError('Store name cannot be empty.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const payload: Partial<Store> = {
        name: editName.trim(),
        timezone: editTimezone,
        active: editActive,
      };
      if (editLatitude.trim() && editLongitude.trim()) {
        payload.latitude = parseFloat(editLatitude.trim());
        payload.longitude = parseFloat(editLongitude.trim());
        payload.radius_meters = parseInt(editRadius.trim(), 10) || 50;
      }
      const updated = await updateStore(storeId, payload);
      setStore(updated);
      setSuccessMsg(`Store "${updated.name}" updated successfully.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update store details.');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleCreateStoreAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminDisplayName.trim() || !adminEmail.trim() || !adminPassword.trim()) {
      setError('Admin name, email, and password are required.');
      return;
    }
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      await createStoreAdmin(storeId, {
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
        display_name: adminDisplayName.trim(),
      });
      setSuccessMsg(`Store Admin "${adminDisplayName}" created and assigned to ${store?.name}.`);
      setShowAddAdminModal(false);
      setAdminDisplayName('');
      setAdminEmail('');
      setAdminPassword('');
      const adminsRes = await listStoreAdmins(storeId);
      setAdmins(adminsRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create store admin.');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empCode.trim() || !empName.trim() || !empHireDate.trim()) {
      setError('Employee code, name, and hire date are required.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createEmployee({
        employee_code: empCode.trim().toUpperCase(),
        display_name: empName.trim(),
        hire_date: empHireDate,
        home_store_id: storeId,
        status: 'active',
      });
      setSuccessMsg(`Employee ${created.display_name} (${created.employee_code}) added.`);
      setShowAddEmployeeModal(false);
      setEmpCode('');
      setEmpName('');
      const empRes = await listEmployees({ store_id: storeId, limit: 100 });
      setEmployees(empRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create employee.');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftCode.trim() || !shiftName.trim()) {
      setError('Shift code and shift name are required.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createShift({
        code: shiftCode.trim().toUpperCase(),
        name: shiftName.trim(),
        store_id: storeId,
        start_time:
          shiftStart.includes(':') && shiftStart.split(':').length === 2
            ? `${shiftStart}:00`
            : shiftStart,
        end_time:
          shiftEnd.includes(':') && shiftEnd.split(':').length === 2 ? `${shiftEnd}:00` : shiftEnd,
        break_minutes: parseInt(shiftBreak, 10) || 0,
        is_overnight: shiftOvernight,
      });
      setSuccessMsg(`Shift "${created.name}" (${created.code}) created.`);
      setShowCreateShiftModal(false);
      setShiftCode('');
      setShiftName('');
      const shiftsRes = await listShifts({ store_id: storeId, limit: 100 });
      setShifts(shiftsRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create shift.');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleAssignRoster(e: React.FormEvent) {
    e.preventDefault();
    if (!rosterEmpId || !rosterShiftId || !rosterFrom || !rosterUntil) {
      setError('Please select employee, shift, and date range.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      await createAssignment({
        employee_id: rosterEmpId,
        shift_id: rosterShiftId,
        effective_from: rosterFrom,
        effective_until: rosterUntil,
      });
      setSuccessMsg('Employee shift roster assigned successfully.');
      setShowAssignRosterModal(false);
      const assignmentsRes = await listAssignments({ store_id: storeId, limit: 100 });
      setAssignments(assignmentsRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to assign roster.');
    } finally {
      setActionInProgress(false);
    }
  }

  function handleTestGeofence() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    if (!store?.latitude || !store?.longitude) {
      setError('Store coordinates are not configured.');
      return;
    }
    setTestingGps(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTestingGps(false);
        const dist = calculateDistanceMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          store.latitude!,
          store.longitude!,
        );
        const radius = store.radius_meters || 50;
        setGpsTestResult({
          distance: dist,
          inside: dist <= radius,
          accuracy: Math.round(pos.coords.accuracy),
          userLat: pos.coords.latitude,
          userLng: pos.coords.longitude,
        });
      },
      (err) => {
        setTestingGps(false);
        setError(`GPS test error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (loading) return <LoadingState label="Loading store management options..." />;
  if (!store)
    return (
      <EmptyState title="Store Not Found" description="The requested store could not be found." />
    );

  const hasLocation =
    store.latitude !== undefined &&
    store.latitude !== null &&
    store.longitude !== undefined &&
    store.longitude !== null;

  return (
    <div
      className="target-store-hub"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
    >
      {/* Notifications */}
      {error && (
        <div
          className="notice notice-error"
          style={{
            padding: '0.75rem 1rem',
            background: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <ShieldAlert size={18} />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {successMsg && (
        <div
          className="notice notice-success"
          style={{
            padding: '0.75rem 1rem',
            background: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '6px',
            color: '#15803d',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. STORE HUB OVERVIEW (RENDERED WHEN NO DEDICATED SECTION IS SELECTED)   */}
      {/* ========================================================================= */}
      {activeSection === 'none' && (
        <>
          {/* Top Header & Back Link */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={onBack}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to All Stores
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>{store.name}</h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    background: '#f1f5f9',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                  }}
                >
                  CODE: {store.code}
                </span>
                <StatusBadge tone={store.active ? 'success' : 'neutral'}>
                  {store.active ? 'Active' : 'Inactive'}
                </StatusBadge>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Store-scoped management hub: details, manager access, employees, shifts, and
                attendance.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="secondary" onClick={loadStoreHubData}>
                <RefreshCw size={14} /> Refresh
              </Button>
            </div>
          </div>

          {/* 6 Store Options Cards Grid */}
          <div
            className="store-options-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Card 1: Store Details & Location */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <Building2 size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Store Details & Location
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        CODE: {store.code}
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone={store.active ? 'success' : 'neutral'}>
                    {store.active ? 'Active' : 'Inactive'}
                  </StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <Globe size={14} />
                  <span>
                    Timezone: <strong>{store.timezone}</strong>
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <MapPin size={14} style={{ color: hasLocation ? '#0284c7' : '#94a3b8' }} />
                  {hasLocation ? (
                    <span>
                      {store.latitude?.toFixed(4)}, {store.longitude?.toFixed(4)} (±
                      {store.radius_meters || 50}m)
                    </span>
                  ) : (
                    <span style={{ fontStyle: 'italic' }}>No Google Maps location set</span>
                  )}
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('details')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Edit Store Details &rarr;
              </Button>
            </Card>

            {/* Card 2: Manager Access (Store Admins) */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <UserCheck size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Manager Access
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        ROLE: STORE ADMIN
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone={admins.length > 0 ? 'success' : 'neutral'}>
                    {admins.length} Assigned
                  </StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <UserCheck size={14} />
                  <span>Store-scoped managerial access</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <Mail size={14} />
                  <span>
                    {admins.length > 0 ? admins[0].email : 'No store admin account assigned'}
                  </span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('admins')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Manage Store Admins &rarr;
              </Button>
            </Card>

            {/* Card 3: Store Employees */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <Users size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Store Employees
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        WORKFORCE: {employees.length} STAFF
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone={employees.length > 0 ? 'success' : 'neutral'}>
                    {employees.length > 0 ? 'Assigned' : 'Empty'}
                  </StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <Building2 size={14} />
                  <span>Home store workforce directory</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <Users size={14} />
                  <span>{employees.length} active employees registered</span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('employees')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Manage Store Employees &rarr;
              </Button>
            </Card>

            {/* Card 4: Shifts & Rostering */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <Clock size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Shifts & Rosters
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        SCHEDULE: {shifts.length} SHIFTS
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone={assignments.length > 0 ? 'success' : 'neutral'}>
                    {assignments.length} Rostered
                  </StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <Clock size={14} />
                  <span>Operational shift definitions & breaks</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <Calendar size={14} />
                  <span>Effective-dated roster assignments</span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('shifts')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Manage Shifts & Rosters &rarr;
              </Button>
            </Card>

            {/* Card 5: Store QR Entrance Station */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <QrCode size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Attendance QR Station
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        KIOSK: ENTRANCE TABLET
                      </span>
                    </div>
                  </div>
                  <StatusBadge tone="success">15s Anti-Replay</StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <QrCode size={14} />
                  <span>Dynamic rotating HMAC store challenge</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <MapPin size={14} />
                  <span>Enforces physical location & photo capture</span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('attendance')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Open Entrance Station &rarr;
              </Button>
            </Card>

            {/* Card 6: Geofence Boundary Tester */}
            <Card
              className="store-card"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: '1px solid #e2e8f0',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '0.5rem',
                        borderRadius: '8px',
                        background: '#e0f2fe',
                        color: '#0284c7',
                      }}
                    >
                      <LocateFixed size={20} />
                    </span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>
                        Geofence Accuracy Tester
                      </h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        RADIUS: ±{store.radius_meters || 50}M
                      </span>
                    </div>
                  </div>
                  <StatusBadge
                    tone={gpsTestResult ? (gpsTestResult.inside ? 'success' : 'danger') : 'neutral'}
                  >
                    {gpsTestResult ? (gpsTestResult.inside ? 'Inside' : 'Outside') : 'Ready'}
                  </StatusBadge>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '0.5rem',
                  }}
                >
                  <LocateFixed size={14} />
                  <span>Verify device GPS against store pin</span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    color: '#64748b',
                    marginBottom: '1.25rem',
                  }}
                >
                  <MapPin size={14} />
                  <span>
                    {gpsTestResult
                      ? `Distance: ${gpsTestResult.distance}m (±${gpsTestResult.accuracy}m fix)`
                      : 'Test physical entrance before onboarding'}
                  </span>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => goToSection('geofence')}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.9rem' }}
              >
                Open Geofence Tester &rarr;
              </Button>
            </Card>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* 2. DEDICATED FULL PAGE: STORE DETAILS & LOCATION GEOFENCE                 */}
      {/* ========================================================================= */}
      {activeSection === 'details' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  Store Details & Location
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    background: '#f1f5f9',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    letterSpacing: '0.05em',
                  }}
                >
                  CODE: {store.code}
                </span>
                <StatusBadge tone={store.active ? 'success' : 'neutral'}>
                  {store.active ? 'Active' : 'Inactive'}
                </StatusBadge>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Configure store branding, operational timezone, and Google Maps geofence
                coordinates.
              </p>
            </div>

            <Button variant="secondary" onClick={() => goToSection('none')}>
              <X size={15} /> Close Details
            </Button>
          </div>

          {/* Full Page Store Details Form Card */}
          <Card style={{ padding: '1.5rem' }}>
            <form
              onSubmit={handleUpdateStore}
              style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                <FormField
                  label="Store Code"
                  type="text"
                  value={store.code}
                  disabled
                  hint="Permanent authoritative store identifier."
                />
                <FormField
                  label="Store Name"
                  type="text"
                  value={editName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                  required
                  disabled={!isSuperAdmin}
                  hint="Official display name for workforce and payroll."
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      marginBottom: '0.35rem',
                    }}
                  >
                    Operational Timezone
                  </label>
                  <select
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    disabled={!isSuperAdmin}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.875rem',
                      background: isSuperAdmin ? '#fff' : '#f8fafc',
                    }}
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      marginTop: '0.25rem',
                      display: 'block',
                    }}
                  >
                    Used for daily attendance cut-offs and shift schedules.
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1.5rem' }}>
                  <label
                    htmlFor="storeActiveCheckbox"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: isSuperAdmin ? 'pointer' : 'default',
                    }}
                  >
                    <input
                      id="storeActiveCheckbox"
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      disabled={!isSuperAdmin}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    Store is Active for Attendance & Rostering
                  </label>
                </div>
              </div>

              {/* Location Picker & Geofence Boundary */}
              <div
                style={{ marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}
              >
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    marginBottom: '0.5rem',
                  }}
                >
                  Store Entrance Pin & Geofence Boundary (Google Maps)
                </label>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.825rem', color: '#64748b' }}>
                  Search for your store, paste a Google Maps URL, or click directly on the map to
                  pin the physical entrance and set the allowed geofence radius.
                </p>
                <GoogleMapLocationPicker
                  latitude={editLatitude}
                  longitude={editLongitude}
                  radiusMeters={editRadius}
                  mapUrl={editMapLink}
                  onChange={({ latitude, longitude, radiusMeters, mapUrl }) => {
                    if (!isSuperAdmin) return;
                    setEditLatitude(latitude);
                    setEditLongitude(longitude);
                    setEditRadius(radiusMeters);
                    if (mapUrl !== undefined) setEditMapLink(mapUrl);
                  }}
                />
              </div>

              {isSuperAdmin && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '0.75rem',
                    marginTop: '1.25rem',
                  }}
                >
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => goToSection('none')}
                    disabled={actionInProgress}
                  >
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" disabled={actionInProgress}>
                    <Save size={16} />
                    {actionInProgress ? 'Saving…' : 'Save Changes'}
                  </Button>
                </div>
              )}
            </form>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DEDICATED FULL PAGE: STORE ADMINISTRATORS (MANAGER ACCESS)              */}
      {/* ========================================================================= */}
      {activeSection === 'admins' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  Store Administrators
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#0284c7',
                    background: '#e0f2fe',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                  }}
                >
                  {admins.length} Assigned
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Managers with administrative access for {store.name} (viewing employee records,
                managing shifts & rosters, approving exceptions).
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isSuperAdmin && (
                <Button variant="primary" onClick={() => setShowAddAdminModal(true)}>
                  <UserPlus size={15} /> Add Store Admin
                </Button>
              )}
              <Button variant="secondary" onClick={() => goToSection('none')}>
                <X size={15} /> Close Page
              </Button>
            </div>
          </div>

          {/* Full Page Store Admins Table Card */}
          <Card style={{ padding: '1.25rem' }}>
            {admins.length === 0 ? (
              <EmptyState
                title="No Store Administrators Assigned"
                description={`No store administrator is assigned to ${store.name}. Click "Add Store Admin" above to provision manager credentials.`}
              />
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: '0.75rem 1rem' }}>Administrator</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Email Address</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Role Authority</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Assigned Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((adm) => (
                      <tr key={adm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                          {adm.display_name}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Mail size={14} /> {adm.email}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span
                            style={{
                              background: '#f1f5f9',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}
                          >
                            store_admin
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <StatusBadge tone={adm.active ? 'success' : 'neutral'}>
                            {adm.active ? 'Active' : 'Inactive'}
                          </StatusBadge>
                        </td>
                        <td
                          style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.8rem' }}
                        >
                          {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. DEDICATED FULL PAGE: STORE EMPLOYEES & WORKFORCE DIRECTORY              */}
      {/* ========================================================================= */}
      {activeSection === 'employees' && showStaffWizard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <TargetStaffRegistrationWizard
            initialStoreId={store.id}
            onComplete={() => {
              setShowStaffWizard(false);
              loadStoreHubData();
            }}
            onCancel={() => setShowStaffWizard(false)}
          />
        </div>
      )}

      {activeSection === 'employees' && !showStaffWizard && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Store Employees</h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#0284c7',
                    background: '#e0f2fe',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                  }}
                >
                  {employees.length} Staff Registered
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Workforce directory registered with {store.name} as their home work site.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {isSuperAdmin && (
                <>
                  <Button variant="primary" onClick={() => setShowStaffWizard(true)}>
                    <UserPlus size={15} /> Register Staff (5-Step Wizard)
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.href = `/admin/org-structure?storeId=${store.id}`;
                    }}
                  >
                    <Network size={15} /> Store Org Hierarchy
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddEmployeeModal(true)}>
                    <Plus size={14} /> Quick Add
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => goToSection('none')}>
                <X size={15} /> Close Page
              </Button>
            </div>
          </div>

          {/* Full Page Store Employees Table Card */}
          <Card style={{ padding: '1.25rem' }}>
            {employees.length === 0 ? (
              <EmptyState
                title="No Employees in this Store"
                description={`No employees are currently mapped to ${store.name}. Click "Register Staff (5-Step Wizard)" to onboard store managers, team leads, pickers/packers, or security.`}
              />
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.875rem',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: '0.75rem 1rem' }}>Employee Code</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Full Name</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Designation / Level</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Hire Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => {
                      const dossiers = getOnboardingDossiers();
                      const d = dossiers.find(
                        (x) => x.employeeId === emp.id || x.employeeCode === emp.employee_code,
                      );
                      const roleLabel = d
                        ? STORE_ROLE_DEFINITIONS[d.designation]?.label ||
                          d.customDesignation ||
                          d.designation
                        : 'Associate Staff';
                      return (
                        <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td
                            style={{ padding: '0.75rem 1rem', fontWeight: 700, color: '#0284c7' }}
                          >
                            {emp.employee_code}
                          </td>
                          <td
                            style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f172a' }}
                          >
                            {emp.display_name}
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span
                              style={{
                                background: '#f1f5f9',
                                padding: '0.2rem 0.5rem',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                color: '#334155',
                              }}
                            >
                              {roleLabel}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <StatusBadge tone={emp.status === 'active' ? 'success' : 'neutral'}>
                              {emp.status}
                            </StatusBadge>
                          </td>
                          <td
                            style={{
                              padding: '0.75rem 1rem',
                              color: '#64748b',
                              fontSize: '0.8rem',
                            }}
                          >
                            {emp.hire_date || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DEDICATED FULL PAGE: SHIFTS & ROSTERING                                 */}
      {/* ========================================================================= */}
      {activeSection === 'shifts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  Shifts & Rostering
                </h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#0284c7',
                    background: '#e0f2fe',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '999px',
                  }}
                >
                  {shifts.length} Shifts · {assignments.length} Rostered
                </span>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Configure operational shift schedules and assign employees to effective-dated
                rosters for {store.name}.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {isSuperAdmin && (
                <>
                  <Button variant="secondary" onClick={() => setShowCreateShiftModal(true)}>
                    <Plus size={15} /> Create Shift
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => setShowAssignRosterModal(true)}
                    disabled={employees.length === 0 || shifts.length === 0}
                  >
                    <Calendar size={15} /> Assign Roster
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => goToSection('none')}>
                <X size={15} /> Close Page
              </Button>
            </div>
          </div>

          {/* Full Page Shifts & Rosters View */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.25rem',
            }}
          >
            {/* Shifts Column */}
            <Card style={{ padding: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Configured Shifts ({shifts.length})
                </h3>
                {isSuperAdmin && (
                  <Button
                    variant="secondary"
                    onClick={() => setShowCreateShiftModal(true)}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Plus size={13} /> Add Shift
                  </Button>
                )}
              </div>

              {shifts.length === 0 ? (
                <EmptyState
                  title="No Shifts Configured"
                  description="No shift definitions exist for this store yet. Click 'Create Shift' to set up opening, closing, or general shifts."
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {shifts.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        padding: '0.875rem',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '0.95rem' }}>{s.name}</strong>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              color: '#0284c7',
                              background: '#e0f2fe',
                              padding: '0.15rem 0.4rem',
                              borderRadius: '4px',
                            }}
                          >
                            {s.code}
                          </span>
                          {s.is_overnight && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: '#7c3aed',
                                background: '#f5f3ff',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                              }}
                            >
                              Overnight
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: '0.825rem',
                            color: '#475569',
                            marginTop: '0.35rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                          }}
                        >
                          <span>
                            <Clock
                              size={12}
                              style={{ display: 'inline', marginRight: '0.25rem' }}
                            />
                            {s.start_time?.slice(0, 5)} → {s.end_time?.slice(0, 5)}
                          </span>
                          <span>Break: {s.break_minutes} mins</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Rosters Column */}
            <Card style={{ padding: '1.25rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Active Employee Rosters ({assignments.length})
                </h3>
                {isSuperAdmin && (
                  <Button
                    variant="primary"
                    onClick={() => setShowAssignRosterModal(true)}
                    disabled={employees.length === 0 || shifts.length === 0}
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                  >
                    <Calendar size={13} /> Assign
                  </Button>
                )}
              </div>

              {assignments.length === 0 ? (
                <EmptyState
                  title="No Rosters Assigned"
                  description={
                    employees.length === 0 || shifts.length === 0
                      ? 'Ensure both shifts and employees exist before assigning roster schedules.'
                      : 'Assign employees to scheduled shifts with specific effective date ranges.'
                  }
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {assignments.map((asgn) => {
                    const emp = employees.find((e) => e.id === asgn.employee_id);
                    const sh = shifts.find((s) => s.id === asgn.shift_id);
                    return (
                      <div
                        key={asgn.id}
                        style={{
                          padding: '0.875rem',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                            {emp ? `${emp.display_name} (${emp.employee_code})` : asgn.employee_id}
                          </div>
                          <div
                            style={{ fontSize: '0.825rem', color: '#0284c7', marginTop: '0.2rem' }}
                          >
                            {sh ? `${sh.name} (${sh.code})` : asgn.shift_id}
                          </div>
                          <div
                            style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}
                          >
                            Effective: {asgn.effective_from} to {asgn.effective_until}
                          </div>
                        </div>
                        <StatusBadge tone="success">Active</StatusBadge>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. DEDICATED FULL PAGE: STORE ENTRANCE QR STATION                         */}
      {/* ========================================================================= */}
      {activeSection === 'attendance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  Attendance QR Station
                </h1>
                <StatusBadge tone="success">15s Dynamic Anti-Replay</StatusBadge>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Authoritative physical entrance kiosk challenge for clocking in/out at {store.name}.
              </p>
            </div>

            <Button variant="secondary" onClick={() => goToSection('none')}>
              <X size={15} /> Close Page
            </Button>
          </div>

          {/* QR Station Info & Launch Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: '1.25rem',
            }}
          >
            <Card
              style={{
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      padding: '0.75rem',
                      borderRadius: '10px',
                      background: '#e0f2fe',
                      color: '#0284c7',
                    }}
                  >
                    <QrCode size={28} />
                  </span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                      Store Entrance Tablet Kiosk
                    </h3>
                    <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                      Designed to run fullscreen on a fixed tablet mounted at the physical store
                      entrance.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#334155',
                    margin: '1.25rem 0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={18} style={{ color: '#16a34a' }} />
                    <span>
                      <strong>HMAC-SHA256 Challenge:</strong> Generated with server-signed store
                      secrets.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={18} style={{ color: '#0284c7' }} />
                    <span>
                      <strong>15-Second Rotation:</strong> Dynamic anti-replay token expires
                      immediately.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <LocateFixed size={18} style={{ color: '#d97706' }} />
                    <span>
                      <strong>Geofence Check:</strong> Scans verified within ±
                      {store.radius_meters || 50}m of store pin.
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Radio size={18} style={{ color: '#7c3aed' }} />
                    <span>
                      <strong>No Biometric Retention:</strong> Verified private selfie upload
                      without facial template storage.
                    </span>
                  </div>
                </div>
              </div>

              <Button
                variant="primary"
                onClick={() => window.open(`/attendance/station#storeId=${store.id}`, '_blank')}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  padding: '0.75rem 1rem',
                  fontSize: '1rem',
                }}
              >
                <ExternalLink size={18} /> Launch Fullscreen Entrance Kiosk
              </Button>
            </Card>

            <Card
              style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1' }}
            >
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', fontWeight: 600 }}>
                Station Deployment Parameters
              </h3>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  fontSize: '0.85rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Store Target</span>
                  <strong>{store.name}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Store Code</span>
                  <strong>{store.code}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Timezone Authority</span>
                  <strong>{store.timezone}</strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Geofence Center</span>
                  <strong>
                    {hasLocation
                      ? `${store.latitude?.toFixed(4)}, ${store.longitude?.toFixed(4)}`
                      : 'Not Set'}
                  </strong>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderBottom: '1px solid #e2e8f0',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Allowed Radius</span>
                  <strong>±{store.radius_meters || 50} meters</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Kiosk Direct URL</span>
                  <a
                    href={`/attendance/station#storeId=${store.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0284c7', textDecoration: 'underline' }}
                  >
                    /attendance/station#storeId={store.id.slice(0, 8)}…
                  </a>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. DEDICATED FULL PAGE: GEOFENCE ACCURACY TESTER                           */}
      {/* ========================================================================= */}
      {activeSection === 'geofence' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section Breadcrumb & Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <button
                type="button"
                onClick={() => goToSection('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: 0,
                  marginBottom: '0.35rem',
                }}
              >
                <ArrowLeft size={16} />
                Back to {store.name} Hub
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  Geofence Accuracy Tester
                </h1>
                <StatusBadge
                  tone={gpsTestResult ? (gpsTestResult.inside ? 'success' : 'danger') : 'neutral'}
                >
                  {gpsTestResult
                    ? gpsTestResult.inside
                      ? 'Inside Geofence'
                      : 'Outside Geofence'
                    : 'Ready to Test'}
                </StatusBadge>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#64748b' }}>
                Verify physical device GPS reception and accuracy against the configured store
                entrance pin.
              </p>
            </div>

            <Button variant="secondary" onClick={() => goToSection('none')}>
              <X size={15} /> Close Page
            </Button>
          </div>

          {/* Live Geofence Test Suite */}
          <Card style={{ padding: '1.5rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                  Test Device GPS Reception
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.85rem' }}>
                  Click below while standing at the store entrance to confirm device geolocation
                  falls within ±{store.radius_meters || 50}m.
                </p>
              </div>
              <Button
                variant="primary"
                onClick={handleTestGeofence}
                disabled={testingGps || !hasLocation}
                style={{ padding: '0.65rem 1.25rem', fontSize: '0.95rem' }}
              >
                <LocateFixed size={18} className={testingGps ? 'animate-spin' : ''} />
                {testingGps ? 'Testing Device GPS Fix…' : 'Test Device Location Now'}
              </Button>
            </div>

            {!hasLocation && (
              <div
                style={{
                  padding: '1rem',
                  background: '#fef2f2',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#b91c1c',
                  fontSize: '0.875rem',
                }}
              >
                ⚠️ This store does not have Google Maps coordinates configured yet. Please go to{' '}
                <strong>Store Details & Location</strong> to set coordinates.
              </div>
            )}

            {/* Test Result Display */}
            {gpsTestResult && (
              <div
                style={{
                  padding: '1.25rem',
                  borderRadius: '8px',
                  background: gpsTestResult.inside ? '#ecfdf5' : '#fffbeb',
                  border: `1px solid ${gpsTestResult.inside ? '#a7f3d0' : '#fde68a'}`,
                  color: gpsTestResult.inside ? '#065f46' : '#92400e',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    marginBottom: '0.5rem',
                  }}
                >
                  {gpsTestResult.inside ? (
                    <>
                      <CheckCircle2 size={22} style={{ color: '#16a34a' }} />
                      <span>DEVICE IS INSIDE GEOFENCE BOUNDARY</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={22} style={{ color: '#d97706' }} />
                      <span>DEVICE IS OUTSIDE GEOFENCE BOUNDARY</span>
                    </>
                  )}
                </div>
                <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                  Calculated distance from store entrance:{' '}
                  <strong>{gpsTestResult.distance} meters</strong>. Allowed store radius:{' '}
                  <strong>±{store.radius_meters || 50} meters</strong>. Browser GPS accuracy
                  estimate: <strong>±{gpsTestResult.accuracy} meters</strong>.
                </div>
              </div>
            )}

            {/* Coordinates Comparison Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '1rem',
              }}
            >
              <div
                style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Store Entrance Center Pin
                </span>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: '0.35rem',
                  }}
                >
                  {hasLocation
                    ? `${store.latitude?.toFixed(6)}, ${store.longitude?.toFixed(6)}`
                    : 'Not Set'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                  Geofence radius: ±{store.radius_meters || 50} meters
                </div>
              </div>

              <div
                style={{
                  padding: '1rem',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                  }}
                >
                  Current Device GPS Fix
                </span>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#0f172a',
                    marginTop: '0.35rem',
                  }}
                >
                  {gpsTestResult?.userLat !== undefined
                    ? `${gpsTestResult.userLat.toFixed(6)}, ${gpsTestResult.userLng?.toFixed(6)}`
                    : 'Awaiting test click…'}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                  {gpsTestResult
                    ? `Accuracy fix: ±${gpsTestResult.accuracy}m`
                    : 'Click "Test Device Location Now"'}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}

      {/* Modal: Add Store Admin */}
      {showAddAdminModal && (
        <Modal
          title={`Provision Store Admin for ${store.name}`}
          onClose={() => setShowAddAdminModal(false)}
          busy={actionInProgress}
        >
          <form
            onSubmit={handleCreateStoreAdmin}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <FormField
              label="Admin Full Name"
              type="text"
              placeholder="e.g. Anand Varma"
              value={adminDisplayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAdminDisplayName(e.target.value)
              }
              required
            />
            <FormField
              label="Admin Email Address"
              type="email"
              placeholder="e.g. anand.varma@snr.com"
              value={adminEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminEmail(e.target.value)}
              required
              hint="Used as sign-in email identifier."
            />
            <FormField
              label="Temporary Password"
              type="password"
              placeholder="At least 8 characters"
              value={adminPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAdminPassword(e.target.value)
              }
              required
              hint="Minimum 8 characters long."
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowAddAdminModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Provisioning…' : 'Create Store Admin'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add Employee */}
      {showAddEmployeeModal && (
        <Modal
          title={`Add Employee to ${store.name}`}
          onClose={() => setShowAddEmployeeModal(false)}
          busy={actionInProgress}
        >
          <form
            onSubmit={handleCreateEmployee}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <FormField
              label="Employee Code"
              type="text"
              placeholder="e.g. EMP-101"
              value={empCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEmpCode(e.target.value.toUpperCase())
              }
              required
              hint="Unique identifier for workforce roster."
            />
            <FormField
              label="Full Name"
              type="text"
              placeholder="e.g. Kavita Reddy"
              value={empName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpName(e.target.value)}
              required
            />
            <FormField
              label="Hire Date"
              type="date"
              value={empHireDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpHireDate(e.target.value)}
              required
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowAddEmployeeModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Adding…' : 'Add Employee'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Create Shift */}
      {showCreateShiftModal && (
        <Modal
          title={`Create Shift for ${store.name}`}
          onClose={() => setShowCreateShiftModal(false)}
          busy={actionInProgress}
        >
          <form
            onSubmit={handleCreateShift}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <FormField
              label="Shift Code"
              type="text"
              placeholder="e.g. MORN-01"
              value={shiftCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setShiftCode(e.target.value.toUpperCase())
              }
              required
            />
            <FormField
              label="Shift Name"
              type="text"
              placeholder="e.g. Morning Opening Shift"
              value={shiftName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShiftName(e.target.value)}
              required
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField
                label="Start Time"
                type="time"
                value={shiftStart.slice(0, 5)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShiftStart(e.target.value)}
                required
              />
              <FormField
                label="End Time"
                type="time"
                value={shiftEnd.slice(0, 5)}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShiftEnd(e.target.value)}
                required
              />
            </div>
            <FormField
              label="Break Time (minutes)"
              type="number"
              placeholder="60"
              value={shiftBreak}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShiftBreak(e.target.value)}
              hint="Unpaid break duration in minutes."
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="shiftOvernight"
                type="checkbox"
                checked={shiftOvernight}
                onChange={(e) => setShiftOvernight(e.target.checked)}
              />
              <label htmlFor="shiftOvernight" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                Shift spans past midnight (overnight shift)
              </label>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowCreateShiftModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Creating…' : 'Create Shift'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Assign Roster */}
      {showAssignRosterModal && (
        <Modal
          title={`Assign Employee to Shift: ${store.name}`}
          onClose={() => setShowAssignRosterModal(false)}
          busy={actionInProgress}
        >
          <form
            onSubmit={handleAssignRoster}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Select Employee <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={rosterEmpId}
                onChange={(e) => setRosterEmpId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                }}
                required
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.display_name} ({e.employee_code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Select Shift <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={rosterShiftId}
                onChange={(e) => setRosterShiftId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                }}
                required
              >
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code} · {s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField
                label="Effective From"
                type="date"
                value={rosterFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRosterFrom(e.target.value)}
                required
              />
              <FormField
                label="Effective Until"
                type="date"
                value={rosterUntil}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setRosterUntil(e.target.value)
                }
                required
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1rem',
              }}
            >
              <Button
                variant="secondary"
                type="button"
                onClick={() => setShowAssignRosterModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Assigning…' : 'Confirm Assignment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
