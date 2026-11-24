import React, { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
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
import {
  createStoreAdmin,
  listAllStoreAdmins,
  listStores,
  Store,
  StoreAdmin,
} from '../../services/targetWorkforceService';

export default function TargetStoreAdminManagement() {
  const { session } = useAuth() as { session: any };
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Add Admin Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const isSuperAdmin = Boolean(
    session?.actual_role === 'system_admin' ||
    session?.role === 'system_admin' ||
    session?.role === 'admin' ||
    session?.scopes?.some((s: { role: string }) => s.role === 'system_admin'),
  );

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [storesRes, adminsRes] = await Promise.all([
        listStores({ limit: 100 }),
        listAllStoreAdmins(selectedStoreFilter !== 'all' ? selectedStoreFilter : undefined),
      ]);
      setStores(storesRes.items);
      setAdmins(adminsRes.items);
      if (storesRes.items.length > 0 && !targetStoreId) {
        setTargetStoreId(storesRes.items[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load store administrators.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedStoreFilter]);

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!targetStoreId) {
      setError('Please select a target store.');
      return;
    }
    if (!adminDisplayName.trim() || !adminEmail.trim() || !adminPassword) {
      setError('All fields are required.');
      return;
    }
    if (adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setActionInProgress(true);
    setError(null);
    try {
      const created = await createStoreAdmin(targetStoreId, {
        display_name: adminDisplayName.trim(),
        email: adminEmail.trim().toLowerCase(),
        password: adminPassword,
      });

      setSuccessMsg(
        `Store Administrator "${created.display_name}" provisioned successfully for ${created.store_name}.`,
      );
      setShowAddModal(false);
      resetAddForm();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to provision store admin.');
    } finally {
      setActionInProgress(false);
    }
  }

  function resetAddForm() {
    setAdminDisplayName('');
    setAdminEmail('');
    setAdminPassword('');
  }

  const filteredAdmins = admins.filter((adm) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      adm.display_name.toLowerCase().includes(q) ||
      adm.email.toLowerCase().includes(q) ||
      adm.store_name.toLowerCase().includes(q)
    );
  });

  return (
    <div
      className="target-store-admin-management"
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}
    >
      {/* Page Header */}
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
            SUPER ADMIN · ACCESS CONTROL
          </span>
          <h1 style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 700 }}>
            Store Administrators
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
            Provision and manage Store Administrator accounts with store-scoped operational
            authority.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
          {isSuperAdmin && (
            <Button
              variant="primary"
              onClick={() => setShowAddModal(true)}
              disabled={stores.length === 0}
            >
              <UserPlus size={16} />
              Add Store Admin
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
            Viewing store administrators in read-only mode. Only{' '}
            <strong>System Administrators (Super Admin)</strong> have authority to provision Store
            Admin accounts.
          </span>
        </div>
      )}

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

      {/* Filter and Search Bar */}
      <Card style={{ padding: '1rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
              Filter by Store:
            </span>
            <select
              value={selectedStoreFilter}
              onChange={(e) => setSelectedStoreFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#fff',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Stores ({stores.length})</option>
              {stores.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ position: 'relative', width: '280px' }}>
            <input
              type="text"
              placeholder="Search by name, email, store…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
              }}
            />
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Store Admins List */}
      {loading ? (
        <LoadingState label="Loading store administrators..." />
      ) : filteredAdmins.length === 0 ? (
        <EmptyState
          title="No Store Administrators Found"
          description={
            searchQuery || selectedStoreFilter !== 'all'
              ? 'No store administrators match your current filter or search criteria.'
              : 'No store administrators have been provisioned yet. Click "Add Store Admin" to assign a manager to a store.'
          }
        />
      ) : (
        <div
          style={{
            overflowX: 'auto',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
          }}
        >
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
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '0.75rem 1rem' }}>Administrator</th>
                <th style={{ padding: '0.75rem 1rem' }}>Assigned Store</th>
                <th style={{ padding: '0.75rem 1rem' }}>Role Authority</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem' }}>Assigned Date</th>
              </tr>
            </thead>
            <tbody>
              {filteredAdmins.map((adm) => {
                const initials = (adm.display_name || 'Admin')
                  .split(/\s+/)
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();
                return (
                  <tr key={adm.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: '#e0e7ff',
                            color: '#4338ca',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                          }}
                        >
                          {initials}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, color: '#0f172a' }}>
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
                            <Mail size={12} />
                            {adm.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          color: '#334155',
                          fontWeight: 500,
                        }}
                      >
                        <Building2 size={15} style={{ color: '#0284c7' }} />
                        <span>{adm.store_name}</span>
                      </div>
                    </td>

                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#334155',
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
                      style={{ padding: '0.75rem 1rem', color: '#64748b', fontSize: '0.8125rem' }}
                    >
                      {adm.created_at ? new Date(adm.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Add Store Admin */}
      {showAddModal && (
        <Modal
          title="Provision Store Administrator"
          onClose={() => {
            setShowAddModal(false);
            resetAddForm();
          }}
          busy={actionInProgress}
        >
          <form
            onSubmit={handleCreateAdmin}
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
                Target Store <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={targetStoreId}
                onChange={(e) => setTargetStoreId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.625rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontSize: '0.875rem',
                }}
                required
              >
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.code})
                  </option>
                ))}
              </select>
            </div>

            <FormField
              label="Admin Full Name"
              type="text"
              placeholder="e.g. Rajesh Kumar"
              value={adminDisplayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setAdminDisplayName(e.target.value)
              }
              required
            />

            <FormField
              label="Admin Email Address"
              type="email"
              placeholder="e.g. rajesh.kumar@snr.com"
              value={adminEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAdminEmail(e.target.value)}
              required
              hint="Used as sign-in email address."
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
                onClick={() => {
                  setShowAddModal(false);
                  resetAddForm();
                }}
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
    </div>
  );
}
