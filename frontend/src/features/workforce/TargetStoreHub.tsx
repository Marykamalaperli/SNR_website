import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
  KeyRound,
  LocateFixed,
  Mail,
  MapPin,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import { EmptyState, LoadingState } from '../../components/common/States';
import StatusBadge from '../../components/common/StatusBadge';
import FormField from '../../components/forms/FormField';
import { useAuth } from '../../hooks/useAuth';
import GoogleMapLocationPicker from './GoogleMapLocationPicker';
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

type StoreTab = 'overview' | 'admins' | 'employees' | 'shifts' | 'attendance';

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
  const R = 6371e3; // Earth radius in meters
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
  const [activeTab, setActiveTab] = useState<StoreTab>('overview');
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Store data collections
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  // Modals state
  const [showEditStoreModal, setShowEditStoreModal] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [showAddEmployeeModal, setShowAddEmployeeModal] = useState(false);
  const [showCreateShiftModal, setShowCreateShiftModal] = useState(false);
  const [showAssignRosterModal, setShowAssignRosterModal] = useState(false);

  // Edit Store Form
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
      const storeRes = await getStore(storeId);
      setStore(storeRes);

      // Pre-fill edit modal
      setEditName(storeRes.name);
      setEditTimezone(storeRes.timezone || 'Asia/Kolkata');
      setEditMapLink(storeRes.map_url || '');
      setEditLatitude(
        storeRes.latitude !== undefined && storeRes.latitude !== null
          ? String(storeRes.latitude)
          : '',
      );
      setEditLongitude(
        storeRes.longitude !== undefined && storeRes.longitude !== null
          ? String(storeRes.longitude)
          : '',
      );
      setEditRadius(storeRes.radius_meters ? String(storeRes.radius_meters) : '50');
      setEditActive(storeRes.active);

      // Load store-scoped sub-resources in parallel
      const [adminsRes, empRes, shiftsRes, assignmentsRes] = await Promise.all([
        listStoreAdmins(storeId).catch(() => ({ items: [], total: 0 })),
        listEmployees({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
        listShifts({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
        listAssignments({ store_id: storeId, limit: 100 }).catch(() => ({ items: [], total: 0 })),
      ]);

      setAdmins(adminsRes.items);
      setEmployees(empRes.items);
      setShifts(shiftsRes.items);
      setAssignments(assignmentsRes.items);

      if (empRes.items.length > 0 && !rosterEmpId) {
        setRosterEmpId(empRes.items[0].id);
      }
      if (shiftsRes.items.length > 0 && !rosterShiftId) {
        setRosterShiftId(shiftsRes.items[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load store hub.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStoreHubData();
  }, [storeId]);

  // Handle Save Store Details
  async function handleUpdateStore(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) {
      setError('Store name cannot be empty.');
      return;
    }
    const latNum = editLatitude.trim() ? parseFloat(editLatitude.trim()) : null;
    const lngNum = editLongitude.trim() ? parseFloat(editLongitude.trim()) : null;
    const radiusNum = editRadius.trim() ? parseInt(editRadius.trim(), 10) : 50;

    setActionInProgress(true);
    setError(null);
    try {
      const updated = await updateStore(storeId, {
        name: editName.trim(),
        timezone: editTimezone,
        latitude: latNum,
        longitude: lngNum,
        map_url: editMapLink.trim() || (latNum && lngNum ? `https://www.google.com/maps?q=${latNum},${lngNum}` : null),
        radius_meters: radiusNum,
        active: editActive,
      });
      setStore(updated);
      setSuccessMsg(`Store "${updated.name}" updated successfully.`);
      setShowEditStoreModal(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update store.');
    } finally {
      setActionInProgress(false);
    }
  }

  // Handle Add Store Admin
  async function handleCreateStoreAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminDisplayName.trim() || !adminEmail.trim() || !adminPassword) {
      setError('All fields are required.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createStoreAdmin(storeId, {
        display_name: adminDisplayName.trim(),
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
      });
      setSuccessMsg(`Store Admin "${created.display_name}" provisioned successfully.`);
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

  // Handle Add Employee
  async function handleCreateEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empCode.trim() || !empName.trim() || !empHireDate) {
      setError('Employee code, name, and hire date are required.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createEmployee({
        employee_code: empCode.trim().toUpperCase(),
        display_name: empName.trim(),
        home_store_id: storeId,
        hire_date: empHireDate,
        status: 'active',
      });
      setSuccessMsg(`Employee "${created.display_name}" (${created.employee_code}) assigned to this store.`);
      setShowAddEmployeeModal(false);
      setEmpCode('');
      setEmpName('');
      const empRes = await listEmployees({ store_id: storeId, limit: 100 });
      setEmployees(empRes.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add employee.');
    } finally {
      setActionInProgress(false);
    }
  }

  // Handle Create Shift
  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftCode.trim() || !shiftName.trim()) {
      setError('Shift code and name are required.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createShift({
        code: shiftCode.trim().toUpperCase(),
        name: shiftName.trim(),
        store_id: storeId,
        start_time: shiftStart.includes(':') && shiftStart.split(':').length === 2 ? `${shiftStart}:00` : shiftStart,
        end_time: shiftEnd.includes(':') && shiftEnd.split(':').length === 2 ? `${shiftEnd}:00` : shiftEnd,
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

  // Handle Assign Roster
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

  // Geofence check tester
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
        });
      },
      (err) => {
        setTestingGps(false);
        setError(`GPS test error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  if (loading) return <LoadingState label="Loading store management hub..." />;
  if (!store) return <EmptyState title="Store Not Found" description="The requested store could not be found." />;

  const hasLocation =
    store.latitude !== undefined &&
    store.latitude !== null &&
    store.longitude !== undefined &&
    store.longitude !== null;

  return (
    <div className="target-store-hub" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Top Navigation & Back Link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
          }}
        >
          <ArrowLeft size={16} />
          Back to All Stores
        </button>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={loadStoreHubData}>
            <RefreshCw size={14} /> Refresh Hub
          </Button>
          {isSuperAdmin && (
            <Button variant="primary" onClick={() => setShowEditStoreModal(true)}>
              <Pencil size={14} /> Edit Store
            </Button>
          )}
        </div>
      </div>

      {/* Store Header Banner */}
      <Card style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span
              style={{
                display: 'inline-flex',
                padding: '0.75rem',
                borderRadius: '10px',
                background: '#e0f2fe',
                color: '#0284c7',
              }}
            >
              <Building2 size={28} />
            </span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{store.name}</h1>
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '0.2rem 0.5rem',
                    background: '#f1f5f9',
                    borderRadius: '4px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: '#475569',
                  }}
                >
                  {store.code}
                </span>
                <StatusBadge tone={store.active ? 'success' : 'neutral'}>
                  {store.active ? 'Active' : 'Inactive'}
                </StatusBadge>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  fontSize: '0.8125rem',
                  color: '#64748b',
                  marginTop: '0.35rem',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Globe size={13} /> Timezone: <strong>{store.timezone}</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <MapPin size={13} style={{ color: hasLocation ? '#0284c7' : '#94a3b8' }} />
                  {hasLocation ? (
                    <a
                      href={`https://www.google.com/maps?q=${store.latitude},${store.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#0284c7', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                    >
                      {store.latitude?.toFixed(4)}, {store.longitude?.toFixed(4)} (±{store.radius_meters || 50}m geofence)
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    'Location not configured'
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '0.75rem',
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <div style={{ background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Store Admins</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{admins.length}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Assigned Staff</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{employees.length}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Configured Shifts</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{shifts.length}</div>
          </div>
          <div style={{ background: '#f8fafc', padding: '0.6rem 0.85rem', borderRadius: '6px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Active Rosters</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{assignments.length}</div>
          </div>
        </div>
      </Card>

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
        </div>
      )}

      {/* Hub Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #e2e8f0',
          gap: '0.5rem',
          overflowX: 'auto',
        }}
      >
        {[
          { id: 'overview', label: 'Store Details & Map', icon: Building2 },
          { id: 'admins', label: `Manager Access (${admins.length})`, icon: UserCheck },
          { id: 'employees', label: `Store Employees (${employees.length})`, icon: Users },
          { id: 'shifts', label: `Shifts & Rosters (${shifts.length})`, icon: Clock },
          { id: 'attendance', label: 'Attendance & QR Station', icon: QrCode },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as StoreTab);
                setError(null);
                setSuccessMsg(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: isActive ? '3px solid #0284c7' : '3px solid transparent',
                color: isActive ? '#0284c7' : '#64748b',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.875rem',
                padding: '0.6rem 0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview & Location Map */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          <Card style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600 }}>
              Store Information
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Store Code</span>
                <strong>{store.code}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Store Name</span>
                <strong>{store.name}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Operational Timezone</span>
                <strong>{store.timezone}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Attendance Geofence Boundary</span>
                <strong>±{store.radius_meters || 50} meters from store pin</strong>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <Button variant="secondary" onClick={() => setShowEditStoreModal(true)}>
                  <Pencil size={14} /> Edit Store Information
                </Button>
              </div>
            </div>
          </Card>

          <Card style={{ padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <MapPin size={16} style={{ color: '#0284c7' }} />
              Location on Google Maps
            </h3>
            {hasLocation ? (
              <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1' }}>
                <iframe
                  title="Store Location Pin"
                  width="100%"
                  height="220"
                  style={{ border: 0, display: 'block' }}
                  loading="lazy"
                  src={`https://maps.google.com/maps?q=${store.latitude},${store.longitude}&z=16&output=embed`}
                />
                <div
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#f8fafc',
                    fontSize: '0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>
                    Pin: <strong>{store.latitude?.toFixed(5)}, {store.longitude?.toFixed(5)}</strong>
                  </span>
                  <a
                    href={`https://www.google.com/maps?q=${store.latitude},${store.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '0.2rem', textDecoration: 'underline' }}
                  >
                    Open Google Maps <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: '#f8fafc', borderRadius: '6px' }}>
                <p style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.85rem' }}>
                  No Google Maps location set for this store yet.
                </p>
                <Button variant="secondary" onClick={() => setShowEditStoreModal(true)}>
                  Choose Location on Map
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 2: Manager Access (Store Admins) */}
      {activeTab === 'admins' && (
        <Card style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                Store Administrators ({admins.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                Managers with administrative authority over {store.name}.
              </p>
            </div>
            {isSuperAdmin && (
              <Button variant="primary" onClick={() => setShowAddAdminModal(true)}>
                <UserPlus size={15} /> Add Store Admin
              </Button>
            )}
          </div>

          {admins.length === 0 ? (
            <EmptyState
              title="No Store Administrators Assigned"
              description={`No store admin is currently assigned to ${store.name}. Click "Add Store Admin" to provision access.`}
            />
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Administrator</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Email</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Role Authority</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Assigned Date</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((adm) => (
                    <tr key={adm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {adm.display_name}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Mail size={12} /> {adm.email}
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <span style={{ background: '#f1f5f9', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                          store_admin
                        </span>
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <StatusBadge tone={adm.active ? 'success' : 'neutral'}>
                          {adm.active ? 'Active' : 'Inactive'}
                        </StatusBadge>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b', fontSize: '0.75rem' }}>
                        {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 3: Store Employees */}
      {activeTab === 'employees' && (
        <Card style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                Store Staff ({employees.length})
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                Workforce members whose primary home store is {store.name}.
              </p>
            </div>
            {isSuperAdmin && (
              <Button variant="primary" onClick={() => setShowAddEmployeeModal(true)}>
                <UserPlus size={15} /> Add Employee to Store
              </Button>
            )}
          </div>

          {employees.length === 0 ? (
            <EmptyState
              title="No Employees in this Store"
              description={`No employee records are assigned to ${store.name} yet. Click "Add Employee to Store" to create one.`}
            />
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '0.65rem 1rem' }}>Employee Code</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Full Name</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Status</th>
                    <th style={{ padding: '0.65rem 1rem' }}>Hire Date</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 700, color: '#0284c7' }}>
                        {emp.employee_code}
                      </td>
                      <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                        {emp.display_name}
                      </td>
                      <td style={{ padding: '0.65rem 1rem' }}>
                        <StatusBadge tone={emp.status === 'active' ? 'success' : 'neutral'}>
                          {emp.status}
                        </StatusBadge>
                      </td>
                      <td style={{ padding: '0.65rem 1rem', color: '#64748b', fontSize: '0.75rem' }}>
                        {emp.hire_date || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Tab 4: Shifts & Rostering */}
      {activeTab === 'shifts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Shifts Section */}
          <Card style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                  Store Operational Shifts ({shifts.length})
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                  Standard work shifts and grace windows defined for {store.name}.
                </p>
              </div>
              {isSuperAdmin && (
                <Button variant="primary" onClick={() => setShowCreateShiftModal(true)}>
                  <Plus size={15} /> Create New Shift
                </Button>
              )}
            </div>

            {shifts.length === 0 ? (
              <EmptyState
                title="No Shifts Defined"
                description={`No shifts exist for ${store.name}. Create shifts (e.g. Morning, Evening) to begin scheduling.`}
              />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
                {shifts.map((sh) => (
                  <div
                    key={sh.id}
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '1rem',
                      background: '#f8fafc',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7' }}>
                        {sh.code}
                      </span>
                      <StatusBadge tone={sh.active ? 'success' : 'neutral'}>
                        {sh.active ? 'Active' : 'Inactive'}
                      </StatusBadge>
                    </div>
                    <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{sh.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#334155', fontSize: '0.85rem' }}>
                      <Clock size={14} style={{ color: '#64748b' }} />
                      <strong>{sh.start_time?.slice(0, 5)}</strong> to <strong>{sh.end_time?.slice(0, 5)}</strong>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Break: {sh.break_minutes || 0} mins {sh.is_overnight ? '· Overnight' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Rostering / Shift Assignments Section */}
          <Card style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
                  Employee Rosters ({assignments.length})
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', color: '#64748b', fontSize: '0.8rem' }}>
                  Effective-dated shift assignments connecting staff to operational shifts.
                </p>
              </div>
              {isSuperAdmin && (
                <Button
                  variant="primary"
                  onClick={() => setShowAssignRosterModal(true)}
                  disabled={employees.length === 0 || shifts.length === 0}
                >
                  <Calendar size={15} /> Assign Employee to Shift
                </Button>
              )}
            </div>

            {assignments.length === 0 ? (
              <EmptyState
                title="No Rosters Assigned"
                description={`No active employee shift rosters found for ${store.name}.`}
              />
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                      <th style={{ padding: '0.65rem 1rem' }}>Employee</th>
                      <th style={{ padding: '0.65rem 1rem' }}>Assigned Shift</th>
                      <th style={{ padding: '0.65rem 1rem' }}>Effective Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((asgn) => {
                      const emp = employees.find((e) => e.id === asgn.employee_id);
                      const sh = shifts.find((s) => s.id === asgn.shift_id);
                      return (
                        <tr key={asgn.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.65rem 1rem', fontWeight: 600, color: '#0f172a' }}>
                            {emp ? `${emp.display_name} (${emp.employee_code})` : asgn.employee_id}
                          </td>
                          <td style={{ padding: '0.65rem 1rem', color: '#0284c7', fontWeight: 500 }}>
                            {sh ? `${sh.name} (${sh.start_time?.slice(0, 5)} - ${sh.end_time?.slice(0, 5)})` : asgn.shift_id}
                          </td>
                          <td style={{ padding: '0.65rem 1rem', color: '#64748b' }}>
                            {asgn.effective_from} → {asgn.effective_until}
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

      {/* Tab 5: Live Attendance & QR Station */}
      {activeTab === 'attendance' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {/* Store QR Station Card */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ padding: '0.5rem', background: '#e0f2fe', borderRadius: '8px', color: '#0284c7' }}>
                <QrCode size={22} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Store Entrance QR Station</h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Rotating anti-replay QR code</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
              Launch the dedicated attendance station for <strong>{store.name}</strong> on a store entrance tablet or guard phone. The station displays an HMAC-signed QR challenge that rotates every 15 seconds to prevent photo sharing and spoofing.
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <Button
                variant="primary"
                onClick={() => window.open(`/attendance/station#storeId=${store.id}`, '_blank')}
              >
                <QrCode size={15} /> Open Entrance Station Kiosk
              </Button>
            </div>
          </Card>

          {/* Store Geofence & Device Tester */}
          <Card style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ padding: '0.5rem', background: '#ecfdf5', borderRadius: '8px', color: '#059669' }}>
                <LocateFixed size={22} />
              </span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Geofence Accuracy Tester</h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Verify physical store attendance boundary</span>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
              Configured fence radius: <strong>±{store.radius_meters || 50} meters</strong> from coordinates (
              {store.latitude?.toFixed(4)}, {store.longitude?.toFixed(4)}). Test your device GPS to verify that employees standing at the store entrance will pass location checks.
            </p>

            <div style={{ marginTop: '0.75rem' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={handleTestGeofence}
                disabled={testingGps || !hasLocation}
              >
                <LocateFixed size={14} className={testingGps ? 'animate-spin' : ''} />
                {testingGps ? 'Reading Device GPS…' : 'Test My Distance to Store'}
              </Button>
            </div>

            {gpsTestResult && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: gpsTestResult.inside ? '#ecfdf5' : '#fffbeb',
                  border: `1px solid ${gpsTestResult.inside ? '#a7f3d0' : '#fde68a'}`,
                  color: gpsTestResult.inside ? '#065f46' : '#92400e',
                  fontSize: '0.85rem',
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  {gpsTestResult.inside ? '✅ INSIDE STORE GEOFENCE' : '⚠️ OUTSIDE STORE GEOFENCE'}
                </div>
                <div>Distance from store pin: <strong>{gpsTestResult.distance} meters</strong></div>
                <div style={{ fontSize: '0.75rem' }}>GPS fix accuracy: ±{gpsTestResult.accuracy}m</div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Modal: Edit Store Details */}
      {showEditStoreModal && (
        <Modal
          title={`Edit Store Details: ${store.name}`}
          onClose={() => setShowEditStoreModal(false)}
          busy={actionInProgress}
        >
          <form onSubmit={handleUpdateStore} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Store Code" type="text" value={store.code} disabled hint="Store code cannot be altered." />
            <FormField
              label="Store Name"
              type="text"
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
              required
            />
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Operational Timezone
              </label>
              <select
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Store Location on Google Maps
              </label>
              <GoogleMapLocationPicker
                latitude={editLatitude}
                longitude={editLongitude}
                radiusMeters={editRadius}
                mapUrl={editMapLink}
                onChange={({ latitude, longitude, radiusMeters, mapUrl }) => {
                  setEditLatitude(latitude);
                  setEditLongitude(longitude);
                  setEditRadius(radiusMeters);
                  if (mapUrl !== undefined) setEditMapLink(mapUrl);
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                id="hubEditActive"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
              />
              <label htmlFor="hubEditActive" style={{ fontSize: '0.85rem', cursor: 'pointer' }}>
                Store is active for scheduling and attendance
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setShowEditStoreModal(false)} disabled={actionInProgress}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add Store Admin */}
      {showAddAdminModal && (
        <Modal
          title={`Provision Store Admin for ${store.name}`}
          onClose={() => setShowAddAdminModal(false)}
          busy={actionInProgress}
        >
          <form onSubmit={handleCreateStoreAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Admin Full Name"
              type="text"
              placeholder="e.g. Anand Varma"
              value={adminDisplayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminDisplayName(e.target.value)}
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
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminPassword(e.target.value)}
              required
              hint="Minimum 8 characters long."
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setShowAddAdminModal(false)} disabled={actionInProgress}>
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
          <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Employee Code"
              type="text"
              placeholder="e.g. EMP-101"
              value={empCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmpCode(e.target.value.toUpperCase())}
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setShowAddEmployeeModal(false)} disabled={actionInProgress}>
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
          <form onSubmit={handleCreateShift} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Shift Code"
              type="text"
              placeholder="e.g. MORN-01"
              value={shiftCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setShiftCode(e.target.value.toUpperCase())}
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setShowCreateShiftModal(false)} disabled={actionInProgress}>
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
          <form onSubmit={handleAssignRoster} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Select Employee <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={rosterEmpId}
                onChange={(e) => setRosterEmpId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
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
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Select Shift <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={rosterShiftId}
                onChange={(e) => setRosterShiftId(e.target.value)}
                style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRosterUntil(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setShowAssignRosterModal(false)} disabled={actionInProgress}>
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
