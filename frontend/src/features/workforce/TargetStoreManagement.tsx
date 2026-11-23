import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  LocateFixed,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
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
import { parseStoreMapLink } from '../../services/storeMapLink';
import {
  createStore,
  createStoreAdmin,
  listStoreAdmins,
  listStores,
  Store,
  StoreAdmin,
  updateStore,
} from '../../services/targetWorkforceService';

const TIMEZONE_OPTIONS = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export default function TargetStoreManagement() {
  const { session } = useAuth() as { session: any };
  const [stores, setStores] = useState<Store[]>([]);
  const [adminsByStore, setAdminsByStore] = useState<Record<string, StoreAdmin[]>>({});
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [showAddAdminModal, setShowAddAdminModal] = useState(false);
  const [showEditStoreModal, setShowEditStoreModal] = useState(false);
  const [selectedStoreForAdmin, setSelectedStoreForAdmin] = useState<Store | null>(null);
  const [storeToEdit, setStoreToEdit] = useState<Store | null>(null);

  // Store Form State
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeTimezone, setStoreTimezone] = useState('Asia/Kolkata');
  const [storeMapLink, setStoreMapLink] = useState('');
  const [storeLatitude, setStoreLatitude] = useState('');
  const [storeLongitude, setStoreLongitude] = useState('');
  const [storeRadius, setStoreRadius] = useState('50');
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // Edit Store State
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [editMapLink, setEditMapLink] = useState('');
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [editRadius, setEditRadius] = useState('50');
  const [editActive, setEditActive] = useState(true);

  // Store Admin Form State
  const [adminEmail, setAdminEmail] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const isSuperAdmin = Boolean(
    session?.actual_role === 'system_admin' ||
      session?.role === 'system_admin' ||
      session?.role === 'admin' ||
      session?.scopes?.some((s: { role: string }) => s.role === 'system_admin'),
  );

  async function loadStores() {
    setLoading(true);
    setError(null);
    try {
      const res = await listStores({ limit: 100 });
      setStores(res.items);

      // Load admins for all stores in parallel
      const adminMap: Record<string, StoreAdmin[]> = {};
      await Promise.all(
        res.items.map(async (st) => {
          try {
            const adminRes = await listStoreAdmins(st.id);
            adminMap[st.id] = adminRes.items;
          } catch {
            adminMap[st.id] = [];
          }
        }),
      );
      setAdminsByStore(adminMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stores from database.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

  function handleMapLinkChange(
    url: string,
    setLink: (v: string) => void,
    setLat: (v: string) => void,
    setLng: (v: string) => void,
  ) {
    setLink(url);
    setLocationNotice(null);
    if (!url.trim()) return;
    try {
      const point = parseStoreMapLink(url);
      if (point) {
        setLat(String(point.latitude));
        setLng(String(point.longitude));
        setLocationNotice(`Coordinates extracted from Google Maps pin: ${point.latitude}, ${point.longitude}`);
      }
    } catch {
      // Continue without error while user pastes or types
    }
  }

  function handleCaptureGps(setLat: (v: string) => void, setLng: (v: string) => void) {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError(null);
    setLocationNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const lat = pos.coords.latitude.toFixed(7);
        const lng = pos.coords.longitude.toFixed(7);
        setLat(lat);
        setLng(lng);
        setLocationNotice(`Captured current GPS location (accuracy ±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setLocating(false);
        setError(`GPS location failed: ${err.message}. You can open Google Maps to choose your store location instead.`);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function openGoogleMapsPicker(lat?: string, lng?: string) {
    const url =
      lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng))
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : 'https://www.google.com/maps';
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleCreateStore(e: React.FormEvent) {
    e.preventDefault();
    if (!storeCode.trim() || !storeName.trim()) {
      setError('Store code and store name are required.');
      return;
    }

    const latNum = storeLatitude.trim() ? parseFloat(storeLatitude.trim()) : null;
    const lngNum = storeLongitude.trim() ? parseFloat(storeLongitude.trim()) : null;
    const radiusNum = storeRadius.trim() ? parseInt(storeRadius.trim(), 10) : 50;

    if (latNum === null || lngNum === null) {
      setError('Please choose the store location on Google Maps (click the map, search an address, or paste a map link) before creating the store.');
      return;
    }

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    setActionInProgress(true);
    setError(null);
    try {
      const newStore = await createStore({
        code: storeCode.trim().toUpperCase(),
        name: storeName.trim(),
        timezone: storeTimezone,
        latitude: latNum,
        longitude: lngNum,
        map_url: storeMapLink.trim() || (latNum && lngNum ? `https://www.google.com/maps?q=${latNum},${lngNum}` : null),
        radius_meters: radiusNum,
      });
      setSuccessMsg(`Store "${newStore.name}" (${newStore.code}) created successfully.`);
      setShowAddStoreModal(false);
      resetStoreForm();
      await loadStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create store.');
    } finally {
      setActionInProgress(false);
    }
  }

  function resetStoreForm() {
    setStoreCode('');
    setStoreName('');
    setStoreTimezone('Asia/Kolkata');
    setStoreMapLink('');
    setStoreLatitude('');
    setStoreLongitude('');
    setStoreRadius('50');
    setLocationNotice(null);
  }

  async function handleUpdateStore(e: React.FormEvent) {
    e.preventDefault();
    if (!storeToEdit || !editName.trim()) {
      setError('Store name cannot be empty.');
      return;
    }

    const latNum = editLatitude.trim() ? parseFloat(editLatitude.trim()) : null;
    const lngNum = editLongitude.trim() ? parseFloat(editLongitude.trim()) : null;
    const radiusNum = editRadius.trim() ? parseInt(editRadius.trim(), 10) : 50;

    if (latNum !== null && (isNaN(latNum) || latNum < -90 || latNum > 90)) {
      setError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (lngNum !== null && (isNaN(lngNum) || lngNum < -180 || lngNum > 180)) {
      setError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    setActionInProgress(true);
    setError(null);
    try {
      const updated = await updateStore(storeToEdit.id, {
        name: editName.trim(),
        timezone: editTimezone,
        latitude: latNum,
        longitude: lngNum,
        map_url: editMapLink.trim() || (latNum && lngNum ? `https://www.google.com/maps?q=${latNum},${lngNum}` : null),
        radius_meters: radiusNum,
        active: editActive,
      });
      setSuccessMsg(`Store "${updated.name}" updated successfully.`);
      setShowEditStoreModal(false);
      setStoreToEdit(null);
      await loadStores();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update store.');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedStoreForAdmin) return;
    if (!adminEmail.trim() || !adminDisplayName.trim() || !adminPassword.trim()) {
      setError('All fields are required to create a store admin account.');
      return;
    }
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    setActionInProgress(true);
    setError(null);
    try {
      const created = await createStoreAdmin(selectedStoreForAdmin.id, {
        email: adminEmail.trim().toLowerCase(),
        display_name: adminDisplayName.trim(),
        password: adminPassword,
      });
      setSuccessMsg(
        `Store Admin "${created.display_name}" (${created.email}) created and assigned to ${selectedStoreForAdmin.name}.`,
      );
      setShowAddAdminModal(false);
      setSelectedStoreForAdmin(null);
      setAdminEmail('');
      setAdminDisplayName('');
      setAdminPassword('');

      // Refresh admins for this store
      const adminRes = await listStoreAdmins(selectedStoreForAdmin.id);
      setAdminsByStore((prev) => ({
        ...prev,
        [selectedStoreForAdmin.id]: adminRes.items,
      }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create store admin.');
    } finally {
      setActionInProgress(false);
    }
  }

  function openEditStore(store: Store) {
    setStoreToEdit(store);
    setEditName(store.name);
    setEditTimezone(store.timezone || 'Asia/Kolkata');
    setEditLatitude(store.latitude !== undefined && store.latitude !== null ? String(store.latitude) : '');
    setEditLongitude(store.longitude !== undefined && store.longitude !== null ? String(store.longitude) : '');
    setEditMapLink(store.map_url || '');
    setEditRadius(store.radius_meters ? String(store.radius_meters) : '50');
    setEditActive(store.active);
    setLocationNotice(null);
    setShowEditStoreModal(true);
  }

  function openAddAdmin(store: Store) {
    setSelectedStoreForAdmin(store);
    setAdminEmail('');
    setAdminDisplayName('');
    setAdminPassword('');
    setShowAddAdminModal(true);
  }

  return (
    <div className="target-store-management" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner / Actions */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <span className="eyebrow" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-primary)' }}>
            SUPER ADMIN · STORES & STORE MANAGERS
          </span>
          <h2 style={{ margin: '0.25rem 0 0', fontSize: '1.5rem', fontWeight: 600 }}>
            Stores & Work Sites
          </h2>
          <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            Authoritative stores, operational timezones, Google Maps locations, and assigned Store Administrators.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onClick={loadStores} disabled={loading || actionInProgress}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button
              variant="primary"
              onClick={() => {
                setError(null);
                resetStoreForm();
                setShowAddStoreModal(true);
              }}
            >
              <Plus size={16} />
              Add New Store
            </Button>
          )}
        </div>
      </div>

      {/* Role Notice */}
      {!isSuperAdmin && (
        <div
          className="notice"
          style={{
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            fontSize: '0.875rem',
            color: '#475569',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Shield size={16} className="text-primary" />
          <span>
            Viewing stores in read-only mode. Only <strong>System Administrators (Super Admin)</strong> have authority to create stores and provision Store Admin accounts.
          </span>
        </div>
      )}

      {/* Notification Alerts */}
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

      {/* Stores List */}
      {loading ? (
        <LoadingState label="Loading stores and store administrators..." />
      ) : stores.length === 0 ? (
        <EmptyState
          title="No Stores Found"
          description="No operational store locations exist yet. Click 'Add New Store' to create your first store."
        />
      ) : (
        <div
          className="store-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {stores.map((st) => {
            const admins = adminsByStore[st.id] || [];
            const hasLocation = st.latitude !== undefined && st.latitude !== null && st.longitude !== undefined && st.longitude !== null;
            return (
              <Card key={st.id} className="store-card" style={{ padding: '1.25rem' }}>
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
                      <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>{st.name}</h3>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: '#64748b',
                          letterSpacing: '0.05em',
                        }}
                      >
                        CODE: {st.code}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <StatusBadge tone={st.active ? 'success' : 'neutral'}>
                      {st.active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                    {isSuperAdmin && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${st.name}`}
                        onClick={() => openEditStore(st)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          color: '#64748b',
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                  </div>
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
                  <span>Timezone: <strong>{st.timezone}</strong></span>
                </div>

                {/* Location & Google Map Link */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    fontSize: '0.8125rem',
                    marginBottom: '1rem',
                  }}
                >
                  <MapPin size={14} style={{ color: hasLocation ? '#0284c7' : '#94a3b8' }} />
                  {hasLocation ? (
                    <a
                      href={`https://www.google.com/maps?q=${st.latitude},${st.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        color: '#0284c7',
                        fontWeight: 500,
                        textDecoration: 'underline',
                      }}
                    >
                      {st.latitude?.toFixed(4)}, {st.longitude?.toFixed(4)} (±{st.radius_meters || 50}m)
                      <ExternalLink size={12} />
                    </a>
                  ) : (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>
                      No Google Maps location set
                    </span>
                  )}
                </div>

                {/* Store Admins Sub-section */}
                <div
                  style={{
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '0.75rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: '#334155',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <Users size={14} />
                      Store Administrators ({admins.length})
                    </span>

                    {isSuperAdmin && (
                      <Button
                        variant="secondary"
                        onClick={() => openAddAdmin(st)}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        <UserPlus size={13} />
                        Add Admin
                      </Button>
                    )}
                  </div>

                  {admins.length === 0 ? (
                    <p
                      className="muted"
                      style={{
                        fontSize: '0.75rem',
                        fontStyle: 'italic',
                        margin: '0.25rem 0 0',
                        color: '#94a3b8',
                      }}
                    >
                      No Store Admin assigned yet. Click "Add Admin" to provision a manager account.
                    </p>
                  ) : (
                    <ul
                      style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      {admins.map((adm) => (
                        <li
                          key={adm.id}
                          style={{
                            background: '#f8fafc',
                            padding: '0.5rem 0.75rem',
                            borderRadius: '6px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8125rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, color: '#1e293b' }}>
                              {adm.display_name}
                            </div>
                            <div
                              style={{
                                color: '#64748b',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                              }}
                            >
                              <Mail size={11} />
                              {adm.email}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: '#e0e7ff',
                              color: '#4338ca',
                              fontWeight: 600,
                            }}
                          >
                            store_admin
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Add Store */}
      {showAddStoreModal && (
        <Modal
          title="Create New Store Location"
          onClose={() => setShowAddStoreModal(false)}
          busy={actionInProgress}
        >
          <form onSubmit={handleCreateStore} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Store Code"
              type="text"
              placeholder="e.g. HYD-01"
              value={storeCode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreCode(e.target.value.toUpperCase())}
              required
              hint="Unique store identifier in uppercase (e.g. BLR-01, HYD-01)."
            />

            <FormField
              label="Store Name"
              type="text"
              placeholder="e.g. Hyderabad Central Store"
              value={storeName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreName(e.target.value)}
              required
            />

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Operational Timezone
              </label>
              <select
                value={storeTimezone}
                onChange={(e) => setStoreTimezone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.875rem',
                }}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Google Map Location Picker Section */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: '#1e293b',
                }}
              >
                Store Location on Google Maps <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <GoogleMapLocationPicker
                latitude={storeLatitude}
                longitude={storeLongitude}
                radiusMeters={storeRadius}
                mapUrl={storeMapLink}
                onChange={({ latitude, longitude, radiusMeters, mapUrl }) => {
                  setStoreLatitude(latitude);
                  setStoreLongitude(longitude);
                  setStoreRadius(radiusMeters);
                  if (mapUrl !== undefined) setStoreMapLink(mapUrl);
                }}
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
                onClick={() => setShowAddStoreModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Creating...' : 'Create Store'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Store */}
      {showEditStoreModal && storeToEdit && (
        <Modal
          title={`Edit Store: ${storeToEdit.name}`}
          onClose={() => setShowEditStoreModal(false)}
          busy={actionInProgress}
        >
          <form onSubmit={handleUpdateStore} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Store Name"
              type="text"
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
              required
            />

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  marginBottom: '0.25rem',
                }}
              >
                Operational Timezone
              </label>
              <select
                value={editTimezone}
                onChange={(e) => setEditTimezone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.875rem',
                }}
              >
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Google Map Location Picker Section in Edit */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  marginBottom: '0.35rem',
                  color: '#1e293b',
                }}
              >
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                id="editActiveCheckbox"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <label htmlFor="editActiveCheckbox" style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                Store is active for attendance and scheduling
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
                onClick={() => setShowEditStoreModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Add Store Admin */}
      {showAddAdminModal && selectedStoreForAdmin && (
        <Modal
          title={`Add Store Admin: ${selectedStoreForAdmin.name}`}
          onClose={() => setShowAddAdminModal(false)}
          busy={actionInProgress}
        >
          <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: '#f8fafc',
                padding: '0.75rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                color: '#334155',
              }}
            >
              <div><strong>Target Store:</strong> {selectedStoreForAdmin.name} ({selectedStoreForAdmin.code})</div>
              <div><strong>Assigned Role:</strong> Store Administrator (<code>store_admin</code>)</div>
            </div>

            <FormField
              label="Admin Full Name"
              type="text"
              placeholder="e.g. Rajesh Kumar"
              value={adminDisplayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminDisplayName(e.target.value)}
              required
            />

            <FormField
              label="Admin Email Address"
              type="email"
              placeholder="e.g. rajesh.kumar@snr.com"
              value={adminEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminEmail(e.target.value)}
              required
              hint="Used as login identifier."
            />

            <FormField
              label="Temporary Password"
              type="password"
              placeholder="At least 8 characters"
              value={adminPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminPassword(e.target.value)}
              required
              hint="Must be at least 8 characters long."
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
                {actionInProgress ? 'Creating...' : 'Create Store Admin'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
