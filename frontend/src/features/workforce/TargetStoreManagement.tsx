import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  Globe,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
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
import TargetStoreHub from './TargetStoreHub';
import {
  createStore,
  listStores,
  Store,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStoreId = searchParams.get('storeId') || searchParams.get('store');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(urlStoreId);

  useEffect(() => {
    if (urlStoreId) setSelectedStoreId(urlStoreId);
  }, [urlStoreId]);

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [showEditStoreModal, setShowEditStoreModal] = useState(false);

  // Add Store Form State
  const [storeCode, setStoreCode] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeTimezone, setStoreTimezone] = useState('Asia/Kolkata');
  const [storeMapLink, setStoreMapLink] = useState('');
  const [storeLatitude, setStoreLatitude] = useState('');
  const [storeLongitude, setStoreLongitude] = useState('');
  const [storeRadius, setStoreRadius] = useState('50');

  // Edit Store State
  const [storeToEdit, setStoreToEdit] = useState<Store | null>(null);
  const [editName, setEditName] = useState('');
  const [editTimezone, setEditTimezone] = useState('Asia/Kolkata');
  const [editMapLink, setEditMapLink] = useState('');
  const [editLatitude, setEditLatitude] = useState('');
  const [editLongitude, setEditLongitude] = useState('');
  const [editRadius, setEditRadius] = useState('50');
  const [editActive, setEditActive] = useState(true);

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load stores from database.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStores();
  }, []);

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
        map_url: storeMapLink.trim() || `https://www.google.com/maps?q=${latNum},${lngNum}`,
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

  function openEditStore(st: Store) {
    setStoreToEdit(st);
    setEditName(st.name);
    setEditTimezone(st.timezone || 'Asia/Kolkata');
    setEditMapLink(st.map_url || '');
    setEditLatitude(st.latitude !== undefined && st.latitude !== null ? String(st.latitude) : '');
    setEditLongitude(st.longitude !== undefined && st.longitude !== null ? String(st.longitude) : '');
    setEditRadius(st.radius_meters ? String(st.radius_meters) : '50');
    setEditActive(st.active);
    setShowEditStoreModal(true);
  }

  if (selectedStoreId) {
    return (
      <TargetStoreHub
        storeId={selectedStoreId}
        onBack={() => {
          setSelectedStoreId(null);
          const next = new URLSearchParams(searchParams);
          next.delete('storeId');
          next.delete('store');
          setSearchParams(next);
        }}
      />
    );
  }

  return (
    <div className="target-store-management" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <span
            className="eyebrow"
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#0284c7',
              textTransform: 'uppercase',
            }}
          >
            SUPER ADMIN · STORES & WORK SITES
          </span>
          <h1 style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 700 }}>
            Stores & Work Sites
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
            Authoritative physical stores, geofence boundaries, and operational timezones.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onClick={loadStores} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button variant="primary" onClick={() => setShowAddStoreModal(true)}>
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
            Viewing stores in read-only mode. Only <strong>System Administrators (Super Admin)</strong> have authority to create and update stores.
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
        <LoadingState label="Loading store locations..." />
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
            const hasLocation =
              st.latitude !== undefined &&
              st.latitude !== null &&
              st.longitude !== undefined &&
              st.longitude !== null;
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
                  <span>
                    Timezone: <strong>{st.timezone}</strong>
                  </span>
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

                {/* Direct Link to Store Admins */}
                <div
                  style={{
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '0.75rem',
                    marginTop: '0.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <Button
                    variant="primary"
                    onClick={() => {
                      setSelectedStoreId(st.id);
                      setSearchParams({ storeId: st.id });
                    }}
                    style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem' }}
                  >
                    Manage Store &rarr;
                  </Button>
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
                {actionInProgress ? 'Creating Store…' : 'Create Store'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Edit Store */}
      {showEditStoreModal && storeToEdit && (
        <Modal
          title={`Edit Store: ${storeToEdit.name} (${storeToEdit.code})`}
          onClose={() => {
            setShowEditStoreModal(false);
            setStoreToEdit(null);
          }}
          busy={actionInProgress}
        >
          <form onSubmit={handleUpdateStore} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField
              label="Store Code"
              type="text"
              value={storeToEdit.code}
              disabled
              hint="Store code cannot be changed once created."
            />

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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <input
                id="editActiveStore"
                type="checkbox"
                checked={editActive}
                onChange={(e) => setEditActive(e.target.checked)}
                style={{ width: '1rem', height: '1rem' }}
              />
              <label htmlFor="editActiveStore" style={{ fontSize: '0.875rem', color: '#1e293b', cursor: 'pointer' }}>
                Store is active for workforce scheduling and attendance
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
                onClick={() => {
                  setShowEditStoreModal(false);
                  setStoreToEdit(null);
                }}
                disabled={actionInProgress}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={actionInProgress}>
                {actionInProgress ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
