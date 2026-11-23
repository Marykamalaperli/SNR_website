import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Crown,
  Eye,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
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
  X,
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

// Unified person representation for Teams Org Chart
export interface TeamsOrgPerson {
  id: string;
  code: string;
  fullName: string;
  email: string;
  phone?: string;
  roleType: StoreRoleType | 'super_admin' | 'store_admin';
  roleLabel: string;
  category: 'executive' | 'management' | 'supervisory' | 'associate';
  storeId?: string;
  storeName?: string;
  photoUrl?: string;
  status: 'active' | 'on_break' | 'offline';
  reportsToTitle: string;
  dossier?: StaffOnboardingDossier;
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

  // Navigation & View state
  const [activeView, setActiveView] = useState<'chart' | 'pods' | 'register'>('chart');
  const [wizardPrefillRole, setWizardPrefillRole] = useState<StoreRoleType>('picker_packer');

  // Selected person for the Teams Profile Drawer
  const [inspectedPerson, setInspectedPerson] = useState<TeamsOrgPerson | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'overview' | 'authorizations' | 'kyc' | 'compensation'>('overview');

  // Expand / collapse state for tree levels
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    super_admin: true,
    store_admin: true,
    store_manager: true,
    assistant_store_manager: true,
    team_lead: true,
    associates: true,
  });

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

  function toggleNode(nodeKey: string) {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  }

  function expandAll() {
    setExpandedNodes({
      super_admin: true,
      store_admin: true,
      store_manager: true,
      assistant_store_manager: true,
      team_lead: true,
      associates: true,
    });
  }

  function collapseAll() {
    setExpandedNodes({
      super_admin: true,
      store_admin: false,
      store_manager: false,
      assistant_store_manager: false,
      team_lead: false,
      associates: false,
    });
  }

  // Filter staff by selected store
  const filteredAdmins = admins.filter((a) => {
    if (selectedStoreId === 'all') return true;
    return a.store_id === selectedStoreId;
  });

  const filteredDossiers = dossiers.filter((d) => {
    if (selectedStoreId === 'all') return true;
    return !d.storeId || d.storeId === selectedStoreId;
  });

  function getStaffForRole(roleType: StoreRoleType): TeamsOrgPerson[] {
    const matchingDossiers = filteredDossiers.filter((d) => {
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

    const def = STORE_ROLE_DEFINITIONS[roleType];

    return matchingDossiers.map((d) => ({
      id: d.employeeId || d.employeeCode,
      code: d.employeeCode,
      fullName: d.fullName,
      email: d.email,
      phone: d.phone,
      roleType,
      roleLabel: def.label,
      category: def.category,
      storeId: d.storeId,
      storeName: d.storeName,
      photoUrl: d.livePhotoUrl,
      status: 'active',
      reportsToTitle: def.reportingTo,
      dossier: d,
    }));
  }

  const selectedStoreObj = stores.find((s) => s.id === selectedStoreId);

  // Teams Org Data sets
  const smList = getStaffForRole('store_manager');
  const asmList = getStaffForRole('assistant_store_manager');
  const tlList = getStaffForRole('team_lead');
  const pickerList = getStaffForRole('picker_packer');
  const secList = getStaffForRole('security_guard');
  const otherList = getStaffForRole('other');

  // If user requested to open registration wizard directly
  if (activeView === 'register') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <TargetStaffRegistrationWizard
          initialStoreId={selectedStoreId !== 'all' ? selectedStoreId : undefined}
          initialRole={wizardPrefillRole}
          onComplete={() => {
            loadData();
            setActiveView('chart');
          }}
          onCancel={() => setActiveView('chart')}
        />
      </div>
    );
  }

  return (
    <div className="target-org-structure ms-teams-theme" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
      {/* Top Microsoft Teams Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#ffffff',
          padding: '1.25rem 1.5rem',
          borderRadius: '10px',
          border: '1px solid #edebe9',
          boxShadow: '0 1.6px 3.6px 0 rgba(0,0,0,0.08), 0 0.3px 0.9px 0 rgba(0,0,0,0.04)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#5b5fc7',
                background: '#f0f0ff',
                padding: '0.2rem 0.6rem',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <Network size={13} /> Microsoft Teams Org View
            </span>
            <span style={{ fontSize: '0.75rem', color: '#8a8886' }}>· Super Admin Hierarchy</span>
          </div>

          <h1 style={{ margin: '0 0 0.35rem 0', fontSize: '1.65rem', fontWeight: 700, color: '#242424' }}>
            Store Organizational Structure & Roles
          </h1>
          <p style={{ margin: 0, fontSize: '0.875rem', color: '#605e5c' }}>
            Interactive Microsoft Teams-style hierarchy tree, reporting lines, operational authorizations, and staff dossiers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* View Mode Toggle: Org Chart vs Pods */}
          <div
            style={{
              display: 'flex',
              background: '#f3f2f1',
              padding: '0.2rem',
              borderRadius: '6px',
              border: '1px solid #e1dfdd',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView('chart')}
              style={{
                background: activeView === 'chart' ? '#ffffff' : 'transparent',
                color: activeView === 'chart' ? '#5b5fc7' : '#605e5c',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeView === 'chart' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Network size={14} /> Org Chart
            </button>
            <button
              type="button"
              onClick={() => setActiveView('pods')}
              style={{
                background: activeView === 'pods' ? '#ffffff' : 'transparent',
                color: activeView === 'pods' ? '#5b5fc7' : '#605e5c',
                border: 'none',
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: activeView === 'pods' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Users size={14} /> Teams & Pods
            </button>
          </div>

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
            style={{ background: '#5b5fc7', borderColor: '#4f52b2' }}
          >
            <UserPlus size={16} /> Register Staff (5-Step Wizard)
          </Button>
        </div>
      </div>

      {/* Control Bar: Store Selector, Tree Controls, Search Filter */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: '#ffffff',
          padding: '0.85rem 1.25rem',
          borderRadius: '8px',
          border: '1px solid #edebe9',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.825rem', fontWeight: 600, color: '#323130' }}>
            Scope Store:
          </label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            style={{
              padding: '0.45rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: 600,
              background: '#fff',
              color: '#242424',
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
                color: '#5b5fc7',
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

          {activeView === 'chart' && (
            <div style={{ display: 'flex', gap: '0.35rem', marginLeft: '0.5rem' }}>
              <button
                type="button"
                onClick={expandAll}
                style={{
                  background: '#f3f2f1',
                  border: '1px solid #e1dfdd',
                  borderRadius: '4px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#424242',
                  cursor: 'pointer',
                }}
              >
                Expand Tree
              </button>
              <button
                type="button"
                onClick={collapseAll}
                style={{
                  background: '#f3f2f1',
                  border: '1px solid #e1dfdd',
                  borderRadius: '4px',
                  padding: '0.3rem 0.6rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#424242',
                  cursor: 'pointer',
                }}
              >
                Collapse Tree
              </button>
            </div>
          )}
        </div>

        {/* Teams Search Input */}
        <div style={{ position: 'relative', width: '300px' }}>
          <Search
            size={15}
            style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#8a8886' }}
          />
          <input
            type="text"
            placeholder="Search person by name, code, or role…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.45rem 0.75rem 0.45rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid #e1dfdd',
              fontSize: '0.85rem',
              outline: 'none',
              background: '#fcfcfc',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#8a8886',
                padding: '0.2rem',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            padding: '0.75rem 1rem',
            background: '#fdf3f2',
            border: '1px solid #f8d7da',
            borderRadius: '6px',
            color: '#c42b1c',
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

      {/* ========================================================================= */}
      {/* VIEW A: MICROSOFT TEAMS ORG CHART (TREE VIEW)                             */}
      {/* ========================================================================= */}
      {activeView === 'chart' && (
        <div
          className="teams-org-tree-canvas"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2rem 1rem',
            background: '#faf9f8',
            borderRadius: '10px',
            border: '1px solid #edebe9',
            minHeight: '600px',
            overflowX: 'auto',
          }}
        >
          {/* LEVEL 0: ROOT - Super Admin & Executive Org */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <TeamsPersonCard
              person={{
                id: 'root-super-admin',
                code: 'ROOT-EXEC-01',
                fullName: 'Executive Board & Central Ops',
                email: 'operations@snrnest.local',
                phone: '+91 80 4000 0000',
                roleType: 'super_admin',
                roleLabel: 'Super Admin & Central People Operations',
                category: 'executive',
                storeName: 'Central HQ Jurisdiction',
                status: 'active',
                reportsToTitle: 'Board of Directors',
              }}
              isRoot
              isSelected={inspectedPerson?.id === 'root-super-admin'}
              directReportsCount={filteredAdmins.length || 1}
              isExpanded={expandedNodes.super_admin}
              onToggleExpand={() => toggleNode('super_admin')}
              onSelect={(p) => setInspectedPerson(p)}
            />

            {/* Tree Branch from Super Admin to Store Admin */}
            {expandedNodes.super_admin && (
              <>
                <div style={{ width: '2px', height: '32px', background: '#c8c6c4' }} />

                {/* LEVEL 1: STORE ADMINISTRATOR */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {filteredAdmins.length === 0 ? (
                      <TeamsPersonCard
                        person={{
                          id: 'placeholder-store-admin',
                          code: 'ADM-STORE-DEV',
                          fullName: 'Store Administrator (Store Admin)',
                          email: 'store_admin@snrnest.local',
                          phone: '+91 98765 43210',
                          roleType: 'store_admin',
                          roleLabel: 'Store Administrator (Store Admin)',
                          category: 'management',
                          storeName: selectedStoreObj?.name || 'All Assigned Stores',
                          status: 'active',
                          reportsToTitle: 'Super Admin',
                        }}
                        isSelected={inspectedPerson?.id === 'placeholder-store-admin'}
                        directReportsCount={smList.length}
                        isExpanded={expandedNodes.store_admin}
                        onToggleExpand={() => toggleNode('store_admin')}
                        onSelect={(p) => setInspectedPerson(p)}
                      />
                    ) : (
                      filteredAdmins.map((adm) => (
                        <TeamsPersonCard
                          key={adm.id}
                          person={{
                            id: adm.id,
                            code: `ADM-${adm.store_name?.slice(0, 3).toUpperCase() || 'STR'}-01`,
                            fullName: adm.display_name || 'Store Administrator (Store Admin)',
                            email: adm.email,
                            roleType: 'store_admin',
                            roleLabel: 'Store Administrator (Store Admin)',
                            category: 'management',
                            storeId: adm.store_id,
                            storeName: adm.store_name || 'Assigned Store',
                            status: adm.active ? 'active' : 'offline',
                            reportsToTitle: 'Super Admin',
                          }}
                          isSelected={inspectedPerson?.id === adm.id}
                          directReportsCount={smList.length}
                          isExpanded={expandedNodes.store_admin}
                          onToggleExpand={() => toggleNode('store_admin')}
                          onSelect={(p) => setInspectedPerson(p)}
                        />
                      ))
                    )}
                  </div>

                  {/* Tree Branch from Store Admin to Store Manager */}
                  {expandedNodes.store_admin && (
                    <>
                      <div style={{ width: '2px', height: '32px', background: '#c8c6c4' }} />

                      {/* LEVEL 2: STORE MANAGER (SM) */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                          {smList.length === 0 ? (
                            <TeamsEmptyRoleCard
                              roleType="store_manager"
                              roleLabel="Store Manager (SM)"
                              reportsTo="Store Administrator"
                              onRegister={() => {
                                setWizardPrefillRole('store_manager');
                                setActiveView('register');
                              }}
                            />
                          ) : (
                            smList.map((sm) => (
                              <TeamsPersonCard
                                key={sm.id}
                                person={sm}
                                isSelected={inspectedPerson?.id === sm.id}
                                directReportsCount={asmList.length}
                                isExpanded={expandedNodes.store_manager}
                                onToggleExpand={() => toggleNode('store_manager')}
                                onSelect={(p) => setInspectedPerson(p)}
                              />
                            ))
                          )}
                        </div>

                        {/* Tree Branch from SM to Assistant Store Manager */}
                        {expandedNodes.store_manager && (
                          <>
                            <div style={{ width: '2px', height: '32px', background: '#c8c6c4' }} />

                            {/* LEVEL 3: ASSISTANT STORE MANAGER (ASM) */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                {asmList.length === 0 ? (
                                  <TeamsEmptyRoleCard
                                    roleType="assistant_store_manager"
                                    roleLabel="Assistant Store Manager (ASM)"
                                    reportsTo="Store Manager"
                                    onRegister={() => {
                                      setWizardPrefillRole('assistant_store_manager');
                                      setActiveView('register');
                                    }}
                                  />
                                ) : (
                                  asmList.map((asm) => (
                                    <TeamsPersonCard
                                      key={asm.id}
                                      person={asm}
                                      isSelected={inspectedPerson?.id === asm.id}
                                      directReportsCount={tlList.length}
                                      isExpanded={expandedNodes.assistant_store_manager}
                                      onToggleExpand={() => toggleNode('assistant_store_manager')}
                                      onSelect={(p) => setInspectedPerson(p)}
                                    />
                                  ))
                                )}
                              </div>

                              {/* Tree Branch from ASM to Team Lead */}
                              {expandedNodes.assistant_store_manager && (
                                <>
                                  <div style={{ width: '2px', height: '32px', background: '#c8c6c4' }} />

                                  {/* LEVEL 4: TEAM LEAD (TL) */}
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                                    <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                                      {tlList.length === 0 ? (
                                        <TeamsEmptyRoleCard
                                          roleType="team_lead"
                                          roleLabel="Team Lead (TL)"
                                          reportsTo="Assistant Store Manager"
                                          onRegister={() => {
                                            setWizardPrefillRole('team_lead');
                                            setActiveView('register');
                                          }}
                                        />
                                      ) : (
                                        tlList.map((tl) => (
                                          <TeamsPersonCard
                                            key={tl.id}
                                            person={tl}
                                            isSelected={inspectedPerson?.id === tl.id}
                                            directReportsCount={pickerList.length + secList.length + otherList.length}
                                            isExpanded={expandedNodes.team_lead}
                                            onToggleExpand={() => toggleNode('team_lead')}
                                            onSelect={(p) => setInspectedPerson(p)}
                                          />
                                        ))
                                      )}
                                    </div>

                                    {/* Tree Branch from TL to Associates (Pickers, Packers & Security) */}
                                    {expandedNodes.team_lead && (
                                      <>
                                        <div style={{ width: '2px', height: '32px', background: '#c8c6c4' }} />

                                        {/* Horizontal Distribution Line */}
                                        <div
                                          style={{
                                            position: 'relative',
                                            width: '90%',
                                            maxWidth: '960px',
                                            borderTop: '2px solid #c8c6c4',
                                            paddingTop: '24px',
                                            display: 'flex',
                                            justifyContent: 'space-around',
                                            flexWrap: 'wrap',
                                            gap: '2rem',
                                          }}
                                        >
                                          {/* Branch Pod: Associate (Picker & Packer) */}
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '280px' }}>
                                            <div
                                              style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: '#059669',
                                                background: '#ecfdf5',
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '999px',
                                                marginBottom: '0.75rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                              }}
                                            >
                                              Fulfillment & Packing Pod · {pickerList.length} Active
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                                              {pickerList.length === 0 ? (
                                                <TeamsEmptyRoleCard
                                                  roleType="picker_packer"
                                                  roleLabel="Associate (Picker & Packer)"
                                                  reportsTo="Team Lead"
                                                  onRegister={() => {
                                                    setWizardPrefillRole('picker_packer');
                                                    setActiveView('register');
                                                  }}
                                                />
                                              ) : (
                                                pickerList.map((pk) => (
                                                  <TeamsPersonCard
                                                    key={pk.id}
                                                    person={pk}
                                                    isSelected={inspectedPerson?.id === pk.id}
                                                    onSelect={(p) => setInspectedPerson(p)}
                                                  />
                                                ))
                                              )}
                                            </div>
                                          </div>

                                          {/* Branch Pod: Security Guard & Watchman */}
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '280px' }}>
                                            <div
                                              style={{
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                color: '#0369a1',
                                                background: '#f0f9ff',
                                                padding: '0.2rem 0.6rem',
                                                borderRadius: '999px',
                                                marginBottom: '0.75rem',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                              }}
                                            >
                                              Security Guard & Watchman Pod · {secList.length} Active
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                                              {secList.length === 0 ? (
                                                <TeamsEmptyRoleCard
                                                  roleType="security_guard"
                                                  roleLabel="Security Guard & Watchman"
                                                  reportsTo="Store Manager / ASM"
                                                  onRegister={() => {
                                                    setWizardPrefillRole('security_guard');
                                                    setActiveView('register');
                                                  }}
                                                />
                                              ) : (
                                                secList.map((sec) => (
                                                  <TeamsPersonCard
                                                    key={sec.id}
                                                    person={sec}
                                                    isSelected={inspectedPerson?.id === sec.id}
                                                    onSelect={(p) => setInspectedPerson(p)}
                                                  />
                                                ))
                                              )}
                                            </div>
                                          </div>

                                          {/* Branch Pod: Other Roles (if any registered) */}
                                          {otherList.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '280px' }}>
                                              <div
                                                style={{
                                                  fontSize: '0.75rem',
                                                  fontWeight: 700,
                                                  color: '#7c3aed',
                                                  background: '#f5f3ff',
                                                  padding: '0.2rem 0.6rem',
                                                  borderRadius: '999px',
                                                  marginBottom: '0.75rem',
                                                  textTransform: 'uppercase',
                                                  letterSpacing: '0.04em',
                                                }}
                                              >
                                                Specialist Roles Pod · {otherList.length} Active
                                              </div>

                                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', alignItems: 'center' }}>
                                                {otherList.map((oth) => (
                                                  <TeamsPersonCard
                                                    key={oth.id}
                                                    person={oth}
                                                    isSelected={inspectedPerson?.id === oth.id}
                                                    onSelect={(p) => setInspectedPerson(p)}
                                                  />
                                                ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW B: TEAMS & WORKGROUP PODS (DEPARTMENTAL PODS VIEW)                   */}
      {/* ========================================================================= */}
      {activeView === 'pods' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Management Pod */}
          <TeamsPodSection
            title="Store Executive & Managerial Pod"
            description="Store Administrator, Store Manager, and Assistant Store Manager directing daily store operations."
            badgeTone="accent"
            people={[
              ...filteredAdmins.map((a) => ({
                id: a.id,
                code: 'STORE-ADMIN',
                fullName: a.display_name,
                email: a.email,
                roleType: 'store_admin' as const,
                roleLabel: 'Store Administrator (Store Admin)',
                category: 'management' as const,
                storeName: a.store_name,
                status: 'active' as const,
                reportsToTitle: 'Super Admin',
              })),
              ...smList,
              ...asmList,
            ]}
            onSelectPerson={(p) => setInspectedPerson(p)}
            onRegisterRole={(role) => {
              setWizardPrefillRole(role);
              setActiveView('register');
            }}
          />

          {/* Fulfillment Pod */}
          <TeamsPodSection
            title="Floor Operations & Order Fulfillment Pod"
            description="Team Leads, pickers, and packers fulfilling omnichannel customer orders with live barcode scanning."
            badgeTone="success"
            people={[...tlList, ...pickerList]}
            onSelectPerson={(p) => setInspectedPerson(p)}
            onRegisterRole={(role) => {
              setWizardPrefillRole(role);
              setActiveView('register');
            }}
          />

          {/* Security Pod */}
          <TeamsPodSection
            title="Facility Safety & Gate Security Pod"
            description="Security guards and watchmen guarding physical gate entrance and attendance kiosk stations."
            badgeTone="info"
            people={[...secList, ...otherList]}
            onSelectPerson={(p) => setInspectedPerson(p)}
            onRegisterRole={(role) => {
              setWizardPrefillRole(role);
              setActiveView('register');
            }}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* MICROSOFT TEAMS PROFILE & DOSSIER SIDE DRAWER                             */}
      {/* ========================================================================= */}
      {inspectedPerson && (
        <div
          className="teams-profile-drawer-backdrop"
          onClick={() => setInspectedPerson(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <div
            className="teams-profile-drawer"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '460px',
              height: '100%',
              background: '#ffffff',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              animation: 'slideInRight 0.25s ease-out',
            }}
          >
            {/* Teams Header Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #4f52b2 0%, #33344a 100%)',
                color: '#ffffff',
                padding: '1.25rem 1.5rem',
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setInspectedPerson(null)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                {/* Large Avatar */}
                <div style={{ position: 'relative' }}>
                  {inspectedPerson.photoUrl ? (
                    <img
                      src={inspectedPerson.photoUrl}
                      alt={inspectedPerson.fullName}
                      style={{
                        width: '68px',
                        height: '68px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '3px solid #ffffff',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '68px',
                        height: '68px',
                        borderRadius: '50%',
                        background: '#6264a7',
                        color: '#ffffff',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '3px solid #ffffff',
                      }}
                    >
                      {getInitials(inspectedPerson.fullName)}
                    </div>
                  )}

                  {/* Presence indicator: Available / Green */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '2px',
                      right: '2px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#107c41',
                      border: '2px solid #ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Available & On Duty"
                  >
                    <CheckCircle2 size={11} color="#ffffff" strokeWidth={3} />
                  </div>
                </div>

                <div>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#ffffff' }}>
                    {inspectedPerson.fullName}
                  </h2>
                  <div style={{ fontSize: '0.85rem', color: '#e1dfdd', marginTop: '0.2rem' }}>
                    {inspectedPerson.roleLabel}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        background: 'rgba(255,255,255,0.25)',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      {inspectedPerson.code}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#c8c6c4' }}>
                      📍 {inspectedPerson.storeName || 'Primary Store'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Communication Actions (Teams signature) */}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem' }}>
                <a
                  href={`mailto:${inspectedPerson.email}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    background: 'rgba(255,255,255,0.2)',
                    color: '#ffffff',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  <Mail size={14} /> Send Email
                </a>

                {inspectedPerson.phone && (
                  <a
                    href={`tel:${inspectedPerson.phone}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      background: 'rgba(255,255,255,0.2)',
                      color: '#ffffff',
                      padding: '0.45rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <Phone size={14} /> Call
                  </a>
                )}
              </div>
            </div>

            {/* Microsoft Teams Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #edebe9',
                background: '#fcfcfc',
                padding: '0 1rem',
              }}
            >
              {[
                { id: 'overview', label: 'Overview' },
                { id: 'authorizations', label: 'Permissions' },
                { id: 'kyc', label: 'KYC & Verification' },
                { id: 'compensation', label: 'Compensation' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveProfileTab(tab.id as any)}
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: activeProfileTab === tab.id ? '3px solid #5b5fc7' : '3px solid transparent',
                    color: activeProfileTab === tab.id ? '#5b5fc7' : '#605e5c',
                    fontWeight: activeProfileTab === tab.id ? 700 : 500,
                    padding: '0.75rem 0.85rem',
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              {activeProfileTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Reporting Manager line */}
                  <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                      Reporting Structure
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                      Reports to: <strong>{inspectedPerson.reportsToTitle}</strong>
                    </div>
                  </div>

                  {/* Personal & Demographic Info */}
                  <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Contact & Demographic Details
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.825rem' }}>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Email Address</span>
                        <strong>{inspectedPerson.email}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b', display: 'block' }}>Mobile Phone</span>
                        <strong>{inspectedPerson.phone || 'Not provided'}</strong>
                      </div>
                      {inspectedPerson.dossier && (
                        <>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Date of Birth</span>
                            <strong>{inspectedPerson.dossier.dob}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Gender / Marital</span>
                            <strong>{inspectedPerson.dossier.gender} · {inspectedPerson.dossier.maritalStatus}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Date of Joining</span>
                            <strong>{inspectedPerson.dossier.dateOfJoining}</strong>
                          </div>
                          <div>
                            <span style={{ color: '#64748b', display: 'block' }}>Assigned Store</span>
                            <strong>{inspectedPerson.dossier.storeName}</strong>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Emergency Contact */}
                  {inspectedPerson.dossier?.emergencyContact && (
                    <div style={{ background: '#fef2f2', padding: '0.85rem', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                        Emergency Contact
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#991b1b' }}>
                        <strong>{inspectedPerson.dossier.emergencyContact.name}</strong> ({inspectedPerson.dossier.emergencyContact.relationship}) · {inspectedPerson.dossier.emergencyContact.phone}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'authorizations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                    Operational authorizations and system scopes granted to <strong>{inspectedPerson.roleLabel}</strong> in SNR NEST:
                  </div>

                  {inspectedPerson.roleType !== 'super_admin' && inspectedPerson.roleType !== 'store_admin' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {STORE_ROLE_DEFINITIONS[inspectedPerson.roleType as StoreRoleType].authorizations.map((auth, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: '#f8fafc',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            fontSize: '0.825rem',
                            color: '#1e293b',
                          }}
                        >
                          <ShieldCheck size={16} color="#059669" />
                          <span>{auth}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.825rem' }}>
                        <ShieldCheck size={16} color="#0284c7" />
                        <span>Authoritative store scope & management access</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.825rem' }}>
                        <ShieldCheck size={16} color="#0284c7" />
                        <span>Workforce shift assignments & kiosk QR rotation</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.825rem' }}>
                        <ShieldCheck size={16} color="#0284c7" />
                        <span>Payroll draft preview and attendance reconciliation</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'kyc' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {inspectedPerson.dossier ? (
                    <>
                      <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>Aadhar Identity Card</span>
                          <span style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                            VERIFIED
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                          Number: {inspectedPerson.dossier.kycDocuments.aadharNumber}
                        </div>
                      </div>

                      <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600 }}>PAN Tax Card</span>
                          <span style={{ fontSize: '0.75rem', color: '#059669', background: '#ecfdf5', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 700 }}>
                            VERIFIED
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                          Number: {inspectedPerson.dossier.kycDocuments.panNumber}
                        </div>
                      </div>

                      {inspectedPerson.dossier.previousEmployment && (
                        <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Previous Employment Experience
                          </div>
                          <div style={{ fontSize: '0.825rem', color: '#1e293b' }}>
                            Company: <strong>{inspectedPerson.dossier.previousEmployment.companyName}</strong>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.15rem' }}>
                            Role: {inspectedPerson.dossier.previousEmployment.designation}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#059669', marginTop: '0.35rem' }}>
                            ✓ 3 Months Pay Slips & Offer Letter Attached
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                      Standard system identity mapped with corporate credentials.
                    </div>
                  )}
                </div>
              )}

              {activeProfileTab === 'compensation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fef3c7',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      color: '#b45309',
                      fontWeight: 600,
                    }}
                  >
                    Draft - Not for payment · Subject to Store Admin effective-dated approval
                  </div>

                  {inspectedPerson.dossier ? (
                    <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.825rem' }}>
                        <span>Basic Pay:</span>
                        <strong>₹{inspectedPerson.dossier.salary.basic.toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.825rem' }}>
                        <span>House Rent Allowance (HRA):</span>
                        <strong>₹{inspectedPerson.dossier.salary.hra.toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.825rem' }}>
                        <span>Special Allowance:</span>
                        <strong>₹{inspectedPerson.dossier.salary.specialAllowance.toLocaleString('en-IN')}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.825rem', color: '#dc2626' }}>
                        <span>Provident Fund (PF):</span>
                        <span>-₹{inspectedPerson.dossier.salary.pfDeduction.toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', borderBottom: '1px solid #f1f5f9', fontSize: '0.825rem', color: '#dc2626' }}>
                        <span>Employee State Insurance (ESI):</span>
                        <span>-₹{inspectedPerson.dossier.salary.esiDeduction.toLocaleString('en-IN')}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0 0.2rem 0', fontSize: '0.9rem', fontWeight: 700, color: '#059669' }}>
                        <span>Net Take-Home Salary:</span>
                        <span>₹{inspectedPerson.dossier.salary.netTakeHome.toLocaleString('en-IN')}/mo</span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      Standard administrative grade package mapped.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Teams Drawer Footer */}
            <div style={{ padding: '1rem', borderTop: '1px solid #edebe9', background: '#faf9f8', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setInspectedPerson(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEAMS PERSON NODE CARD (Microsoft Teams Style)
// ---------------------------------------------------------------------------
interface TeamsPersonCardProps {
  person: TeamsOrgPerson;
  isRoot?: boolean;
  isSelected?: boolean;
  directReportsCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onSelect: (person: TeamsOrgPerson) => void;
}

function TeamsPersonCard({
  person,
  isRoot,
  isSelected,
  directReportsCount,
  isExpanded,
  onToggleExpand,
  onSelect,
}: TeamsPersonCardProps) {
  // Level badge & top accent color
  let accentColor = '#5b5fc7';
  if (person.roleType === 'super_admin') accentColor = '#111827';
  else if (person.roleType === 'store_admin') accentColor = '#0284c7';
  else if (person.roleType === 'store_manager') accentColor = '#2563eb';
  else if (person.roleType === 'assistant_store_manager') accentColor = '#4f46e5';
  else if (person.roleType === 'team_lead') accentColor = '#7c3aed';
  else accentColor = '#059669';

  return (
    <div
      className={`teams-person-card ${isSelected ? 'selected' : ''}`}
      data-testid="teams-person-card"
      onClick={() => onSelect(person)}
      style={{
        width: '270px',
        background: '#ffffff',
        borderRadius: '8px',
        border: isSelected ? '2px solid #5b5fc7' : '1px solid #e1dfdd',
        boxShadow: isSelected
          ? '0 4px 14px rgba(91, 95, 199, 0.25)'
          : '0 1.6px 3.6px 0 rgba(0,0,0,0.06), 0 0.3px 0.9px 0 rgba(0,0,0,0.03)',
        cursor: 'pointer',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      {/* Top accent line */}
      <div style={{ height: '4px', background: accentColor, width: '100%' }} />

      <div style={{ padding: '0.85rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Avatar with Teams Green Presence Dot */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {person.photoUrl ? (
              <img
                src={person.photoUrl}
                alt={person.fullName}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2px solid #f3f2f1',
                }}
              />
            ) : (
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: isRoot ? '#111827' : accentColor,
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isRoot ? <Crown size={18} color="#f59e0b" /> : getInitials(person.fullName)}
              </div>
            )}

            {/* Active green presence badge */}
            <div
              style={{
                position: 'absolute',
                bottom: '-1px',
                right: '-1px',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: '#107c41',
                border: '2px solid #ffffff',
              }}
              title="Active & On-Shift"
            />
          </div>

          {/* Details */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.875rem',
                color: '#242424',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={person.fullName}
            >
              {person.fullName}
            </div>

            <div
              style={{
                fontSize: '0.75rem',
                color: '#605e5c',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '0.1rem',
              }}
              title={person.roleLabel}
            >
              {person.roleLabel}
            </div>

            <div
              style={{
                fontSize: '0.7rem',
                color: '#8a8886',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginTop: '0.15rem',
              }}
            >
              {person.storeName || 'Primary Store'}
            </div>
          </div>
        </div>

        {/* Card Footer: Direct Reports & Quick Action */}
        <div
          style={{
            marginTop: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid #f3f2f1',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {directReportsCount !== undefined && directReportsCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onToggleExpand) onToggleExpand();
              }}
              style={{
                background: '#f3f2f1',
                border: 'none',
                borderRadius: '999px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#424242',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <Users size={11} />
              <span>{directReportsCount} direct reports</span>
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span style={{ fontSize: '0.7rem', color: '#8a8886' }}>{person.code}</span>
          )}

          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <span
              style={{
                color: '#5b5fc7',
                fontSize: '0.725rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
              }}
            >
              <Eye size={12} /> View
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEAMS EMPTY ROLE CARD (When no staff yet registered)
// ---------------------------------------------------------------------------
interface TeamsEmptyRoleCardProps {
  roleType: StoreRoleType;
  roleLabel: string;
  reportsTo: string;
  onRegister: () => void;
}

function TeamsEmptyRoleCard({ roleType, roleLabel, reportsTo, onRegister }: TeamsEmptyRoleCardProps) {
  return (
    <div
      style={{
        width: '270px',
        background: '#ffffff',
        borderRadius: '8px',
        border: '1px dashed #c8c6c4',
        padding: '0.85rem 1rem',
        textAlign: 'left',
      }}
    >
      <div style={{ fontSize: '0.725rem', color: '#8a8886', textTransform: 'uppercase', fontWeight: 600 }}>
        Role Node · Reports to {reportsTo}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#323130', marginTop: '0.2rem' }}>
        {roleLabel}
      </div>
      <div style={{ fontSize: '0.75rem', color: '#605e5c', margin: '0.4rem 0 0.65rem 0' }}>
        No staff currently provisioned in this role for the active store scope.
      </div>
      <Button
        variant="secondary"
        onClick={onRegister}
        style={{ width: '100%', fontSize: '0.75rem', padding: '0.35rem 0.5rem', justifyContent: 'center' }}
      >
        <Plus size={12} /> Register {roleLabel.split(' ')[0]}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEAMS POD SECTION (Pods View Mode)
// ---------------------------------------------------------------------------
interface TeamsPodSectionProps {
  title: string;
  description: string;
  badgeTone: 'accent' | 'success' | 'info';
  people: TeamsOrgPerson[];
  onSelectPerson: (p: TeamsOrgPerson) => void;
  onRegisterRole: (role: StoreRoleType) => void;
}

function TeamsPodSection({
  title,
  description,
  badgeTone,
  people,
  onSelectPerson,
  onRegisterRole,
}: TeamsPodSectionProps) {
  return (
    <Card style={{ padding: '1.25rem', border: '1px solid #edebe9', background: '#ffffff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.15rem', fontWeight: 700, color: '#242424' }}>
            {title}
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#605e5c' }}>
            {description}
          </p>
        </div>

        <StatusBadge tone={badgeTone === 'accent' ? 'neutral' : badgeTone === 'success' ? 'success' : 'neutral'}>
          {people.length} Members
        </StatusBadge>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1rem',
          marginTop: '1.25rem',
        }}
      >
        {people.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: '#8a8886', fontStyle: 'italic', padding: '1rem 0' }}>
            No team members registered under this pod yet.
          </div>
        ) : (
          people.map((p) => (
            <TeamsPersonCard key={p.id} person={p} onSelect={onSelectPerson} />
          ))
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helper: Name Initials
// ---------------------------------------------------------------------------
function getInitials(name: string): string {
  if (!name) return 'UN';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
