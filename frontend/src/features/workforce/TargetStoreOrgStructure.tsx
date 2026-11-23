import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Briefcase,
  Building2,
  ChevronDown,
  ChevronRight,
  Crown,
  Eye,
  GitFork,
  Mail,
  Network,
  Phone,
  Plus,
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
import StatusBadge from '../../components/common/StatusBadge';
import {
  Employee,
  listEmployees,
  listAllStoreAdmins,
  listStores,
  Store,
  StoreAdmin,
} from '../../services/targetWorkforceService';
import {
  getOnboardingDossiers,
  StaffOnboardingDossier,
  STORE_ROLE_DEFINITIONS,
  StoreRoleType,
} from '../../services/staffOnboardingService';
import TargetStaffRegistrationWizard from './TargetStaffRegistrationWizard';

interface TargetStoreOrgStructureProps {
  initialStoreId?: string;
  onNavigateToStore?: (storeId: string) => void;
}

export default function TargetStoreOrgStructure({
  initialStoreId,
  onNavigateToStore,
}: TargetStoreOrgStructureProps) {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(initialStoreId || 'all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workforce data
  const [admins, setAdmins] = useState<StoreAdmin[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dossiers, setDossiers] = useState<StaffOnboardingDossier[]>([]);

  // View state: 'tree' | 'register'
  const [activeView, setActiveView] = useState<'tree' | 'register'>('tree');
  const [wizardPrefillRole, setWizardPrefillRole] = useState<StoreRoleType>('picker_packer');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [storesRes, adminsRes, empRes] = await Promise.all([
        listStores({ limit: 100 }),
        listAllStoreAdmins().catch(() => ({ items: [], total: 0 })),
        listEmployees({ limit: 200 }).catch(() => ({ items: [], total: 0 })),
      ]);

      setStores(storesRes.items);
      setAdmins(adminsRes.items);
      setEmployees(empRes.items);
      setDossiers(getOnboardingDossiers());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load organization hierarchy data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Filter staff by selected store
  const filteredAdmins = admins.filter((a) => {
    if (selectedStoreId === 'all') return true;
    return a.store_id === selectedStoreId;
  });

  const filteredDossiers = dossiers.filter((d) => {
    if (selectedStoreId === 'all') return true;
    return !d.storeId || d.storeId === selectedStoreId;
  });

  function getStaffForRole(roleType: StoreRoleType) {
    return filteredDossiers.filter((d) => {
      const matchRole = d.designation === roleType;
      if (!matchRole) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.fullName.toLowerCase().includes(q) ||
        d.employeeCode.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q)
      );
    });
  }

  const selectedStoreObj = stores.find((s) => s.id === selectedStoreId);

  // If user requested to open registration wizard directly
  if (activeView === 'register') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TargetStaffRegistrationWizard
          initialStoreId={selectedStoreId !== 'all' ? selectedStoreId : undefined}
          initialRole={wizardPrefillRole}
          onComplete={() => {
            loadData();
            setActiveView('tree');
          }}
          onCancel={() => setActiveView('tree')}
        />
      </div>
    );
  }

  return (
    <div className="target-org-structure" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header & Navigation */}
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
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#0284c7',
              textTransform: 'uppercase',
            }}
          >
            SUPER ADMIN · ORGANIZATIONAL ARCHITECTURE
          </span>
          <h1 style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '1.75rem', fontWeight: 700 }}>
            Store Organizational Structure & Roles
          </h1>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b' }}>
            Store hierarchy, reporting lines, permission levels, and registration workflow under Store Admin.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setWizardPrefillRole('picker_packer');
              setActiveView('register');
            }}
          >
            <UserPlus size={16} /> Register Staff (5-Step Wizard)
          </Button>
        </div>
      </div>

      {/* Control Bar: Store Selector & Search Filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#f8fafc',
          padding: '1rem',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>
            Filter by Store:
          </label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.875rem',
              fontWeight: 600,
              background: '#fff',
            }}
          >
            <option value="all">🏢 All Stores & Work Sites ({stores.length})</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code}) · {s.timezone}
              </option>
            ))}
          </select>

          {selectedStoreObj && onNavigateToStore && (
            <button
              type="button"
              onClick={() => onNavigateToStore(selectedStoreObj.id)}
              style={{
                background: 'none',
                border: 'none',
                color: '#0284c7',
                fontSize: '0.825rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              Open {selectedStoreObj.name} Hub &rarr;
            </button>
          )}
        </div>

        {/* Search Staff */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Search staff by name or code…"
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
        </div>
      </div>

      {/* Notification */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', background: '#fef2f2', border: '1px solid #ef4444', borderRadius: '6px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          <ShieldAlert size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ORGANIZATIONAL HIERARCHY TREE VIEW                                        */}
      {/* ========================================================================= */}
      <div className="org-hierarchy-tree" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
        {/* LEVEL 0: ROOT - Super Admin & Executive Org */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <Card
            style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
              color: '#fff',
              border: '1px solid #334155',
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ display: 'inline-flex', padding: '0.6rem', borderRadius: '8px', background: 'rgba(255,255,255,0.1)' }}>
                  <Crown size={22} style={{ color: '#f59e0b' }} />
                </span>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                    Root Organization Authority
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
                    Super Admin & Central People Operations
                  </h3>
                </div>
              </div>

              <StatusBadge tone="success">Top Tier Authority</StatusBadge>
            </div>

            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.5' }}>
              Holds authoritative jurisdiction over stores, tenant isolation, store admin credentials, salary templates, and audit compliance logs.
            </div>
          </Card>
        </div>

        {/* Tree Connector */}
        <div style={{ width: '2px', height: '24px', background: '#94a3b8' }} />

        {/* LEVEL 1: STORE ADMINISTRATOR (Store Admin) */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <Card
            style={{
              padding: '1.25rem 1.5rem',
              border: '2px solid #0284c7',
              background: '#f0f9ff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ display: 'inline-flex', padding: '0.6rem', borderRadius: '8px', background: '#e0f2fe', color: '#0284c7' }}>
                  <UserCheck size={22} />
                </span>
                <div>
                  <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0284c7', fontWeight: 700 }}>
                    Level 1 · Store Authority
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                    Store Administrator (Store Admin)
                  </h3>
                </div>
              </div>

              <StatusBadge tone="success">{filteredAdmins.length} Assigned</StatusBadge>
            </div>

            <p style={{ margin: '0.5rem 0', fontSize: '0.85rem', color: '#475569' }}>
              Direct store-scoped administrator responsible for the store location, shift schedules, salary templates, and manager access.
            </p>

            <div style={{ background: '#fff', padding: '0.75rem', borderRadius: '6px', border: '1px solid #bae6fd', marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                Assigned Store Admins:
              </div>
              {filteredAdmins.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                  No store administrator accounts currently mapped.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {filteredAdmins.map((adm) => (
                    <div key={adm.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem' }}>
                      <strong>{adm.display_name}</strong>
                      <span style={{ color: '#64748b' }}>{adm.email}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Tree Connector */}
        <div style={{ width: '2px', height: '24px', background: '#94a3b8' }} />

        {/* LEVEL 2: STORE MANAGER (SM) */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <RoleHierarchyCard
            roleType="store_manager"
            staffList={getStaffForRole('store_manager')}
            onRegisterClick={() => {
              setWizardPrefillRole('store_manager');
              setActiveView('register');
            }}
          />
        </div>

        {/* Tree Connector */}
        <div style={{ width: '2px', height: '24px', background: '#94a3b8' }} />

        {/* LEVEL 3: ASSISTANT STORE MANAGER (ASM) */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <RoleHierarchyCard
            roleType="assistant_store_manager"
            staffList={getStaffForRole('assistant_store_manager')}
            onRegisterClick={() => {
              setWizardPrefillRole('assistant_store_manager');
              setActiveView('register');
            }}
          />
        </div>

        {/* Tree Connector */}
        <div style={{ width: '2px', height: '24px', background: '#94a3b8' }} />

        {/* LEVEL 4: TEAM LEAD (TL) */}
        <div style={{ width: '100%', maxWidth: '780px' }}>
          <RoleHierarchyCard
            roleType="team_lead"
            staffList={getStaffForRole('team_lead')}
            onRegisterClick={() => {
              setWizardPrefillRole('team_lead');
              setActiveView('register');
            }}
          />
        </div>

        {/* Tree Connector (Splits into Associates) */}
        <div style={{ width: '2px', height: '24px', background: '#94a3b8' }} />

        {/* LEVEL 5: OPERATIONAL ASSOCIATES (Pickers, Packers & Security) */}
        <div style={{ width: '100%', maxWidth: '980px' }}>
          <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#64748b',
                background: '#f1f5f9',
                padding: '0.2rem 0.6rem',
                borderRadius: '999px',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Level 4 · Front-line Workforce & Facility Security
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {/* Picker & Packer */}
            <RoleHierarchyCard
              roleType="picker_packer"
              staffList={getStaffForRole('picker_packer')}
              onRegisterClick={() => {
                setWizardPrefillRole('picker_packer');
                setActiveView('register');
              }}
            />

            {/* Security Guard & Watchman */}
            <RoleHierarchyCard
              roleType="security_guard"
              staffList={getStaffForRole('security_guard')}
              onRegisterClick={() => {
                setWizardPrefillRole('security_guard');
                setActiveView('register');
              }}
            />

            {/* Other Specialist Roles */}
            <RoleHierarchyCard
              roleType="other"
              staffList={getStaffForRole('other')}
              onRegisterClick={() => {
                setWizardPrefillRole('other');
                setActiveView('register');
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface RoleHierarchyCardProps {
  roleType: StoreRoleType;
  staffList: StaffOnboardingDossier[];
  onRegisterClick: () => void;
}

function RoleHierarchyCard({ roleType, staffList, onRegisterClick }: RoleHierarchyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const def = STORE_ROLE_DEFINITIONS[roleType];

  return (
    <Card style={{ padding: '1.25rem', border: '1px solid #cbd5e1', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: def.category === 'management' ? '#0369a1' : def.category === 'supervisory' ? '#7c3aed' : '#059669',
                background: def.category === 'management' ? '#e0f2fe' : def.category === 'supervisory' ? '#f5f3ff' : '#ecfdf5',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
              }}
            >
              {def.category}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Reports to: <strong>{def.reportingTo}</strong>
            </span>
          </div>

          <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
            {def.label}
          </h3>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.825rem', color: '#64748b' }}>
            {def.description}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge tone={staffList.length > 0 ? 'success' : 'neutral'}>
            {staffList.length} Staff
          </StatusBadge>

          <Button
            variant="secondary"
            onClick={onRegisterClick}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
          >
            <Plus size={13} /> Register
          </Button>
        </div>
      </div>

      {/* Authorizations List */}
      <div style={{ marginTop: '0.75rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
          Authorized Permissions:
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {def.authorizations.map((auth, idx) => (
            <li key={idx}>{auth}</li>
          ))}
        </ul>
      </div>

      {/* Expandable Staff Member List */}
      <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none',
            border: 'none',
            color: '#0284c7',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: 0,
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {expanded ? 'Hide Registered Staff' : `View Registered Staff (${staffList.length})`}
        </button>

        {expanded && (
          <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {staffList.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', padding: '0.5rem 0' }}>
                No employees registered under this designation yet. Click &quot;Register&quot; above to onboard someone.
              </div>
            ) : (
              staffList.map((st) => (
                <div
                  key={st.employeeId || st.employeeCode}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#f8fafc',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '0.85rem' }}>{st.fullName}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                        {st.employeeCode}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                      {st.phone} · Joined: {st.dateOfJoining} · Store: {st.storeName || 'Primary Store'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#059669' }}>
                      ₹{st.salary.grossSalary.toLocaleString('en-IN')}/mo
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
