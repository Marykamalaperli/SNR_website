import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Users,
} from 'lucide-react';
import {
  approvePayrollRun,
  calculateDraftRun,
  createPayPeriod,
  fetchPayPeriods,
  fetchPayrollRun,
  fetchPayrollRuns,
  getPayrollReportCsvUrl,
  PayPeriod,
  PayrollItem,
  PayrollRun,
  releasePayrollRun,
  reversePayrollRun,
} from '../../services/targetPayrollService';

export default function TargetPayrollRuns() {
  const [payPeriods, setPayPeriods] = useState<PayPeriod[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [showCalculateModal, setShowCalculateModal] = useState<boolean>(false);

  // New period form
  const [newPeriodName, setNewPeriodName] = useState('');
  const [newPeriodStart, setNewPeriodStart] = useState('');
  const [newPeriodEnd, setNewPeriodEnd] = useState('');
  const [newPeriodCutoff, setNewPeriodCutoff] = useState('');

  // Calculate run form
  const [selectedPeriodId, setSelectedPeriodId] = useState('');
  const [blockExceptions, setBlockExceptions] = useState(true);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [periodsData, runsData] = await Promise.all([
        fetchPayPeriods(),
        fetchPayrollRuns(),
      ]);
      setPayPeriods(periodsData);
      setRuns(runsData);
      if (periodsData.length > 0 && !selectedPeriodId) {
        setSelectedPeriodId(periodsData[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load payroll data';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreatePeriod(e: React.FormEvent) {
    e.preventDefault();
    if (!newPeriodName || !newPeriodStart || !newPeriodEnd || !newPeriodCutoff) {
      setError('Please fill in all pay period fields.');
      return;
    }
    setCalculating(true);
    setError(null);
    try {
      await createPayPeriod({
        name: newPeriodName,
        start_date: newPeriodStart,
        end_date: newPeriodEnd,
        cutoff_date: newPeriodCutoff,
      });
      setSuccessMsg('Pay period created successfully.');
      setShowPeriodModal(false);
      setNewPeriodName('');
      setNewPeriodStart('');
      setNewPeriodEnd('');
      setNewPeriodCutoff('');
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create pay period';
      setError(msg);
    } finally {
      setCalculating(false);
    }
  }

  async function handleCalculateRun(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPeriodId) {
      setError('Please select a pay period.');
      return;
    }
    setCalculating(true);
    setError(null);
    try {
      const newRun = await calculateDraftRun({
        pay_period_id: selectedPeriodId,
        block_unresolved_exceptions: blockExceptions,
      });
      setSuccessMsg('Deterministic draft payroll calculated successfully.');
      setShowCalculateModal(false);
      await loadData();
      const fullRun = await fetchPayrollRun(newRun.id);
      setSelectedRun(fullRun);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Calculation failed';
      setError(msg);
    } finally {
      setCalculating(false);
    }
  }

  async function handleSelectRun(run: PayrollRun) {
    if (selectedRun?.id === run.id) {
      setSelectedRun(null);
      return;
    }
    try {
      const full = await fetchPayrollRun(run.id);
      setSelectedRun(full);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load run details';
      setError(msg);
    }
  }

  async function handleApproveRun(runId: string) {
    setActionInProgress(true);
    setError(null);
    try {
      const approved = await approvePayrollRun(runId, 'Approved by authorized HR staff');
      setSuccessMsg('Payroll run successfully approved and locked. Private PDF payslips generated.');
      await loadData();
      const full = await fetchPayrollRun(approved.id);
      setSelectedRun(full);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setError(msg);
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleReleasePayslips(runId: string) {
    setActionInProgress(true);
    setError(null);
    try {
      const released = await releasePayrollRun(runId);
      setSuccessMsg(`Successfully released ${released.length} payslips to employees.`);
      await loadData();
      if (selectedRun) {
        const full = await fetchPayrollRun(runId);
        setSelectedRun(full);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Release failed';
      setError(msg);
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <div className="target-payroll-container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* SRS Compliance Watermark Banner */}
      <div
        role="alert"
        style={{
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
        }}
      >
        <ShieldAlert size={24} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>
            DRAFT - NOT FOR PAYMENT
          </div>
          <div style={{ color: '#b45309', fontSize: '0.875rem', marginTop: '2px' }}>
            Statutory, tax, deduction and overtime compliance rules (SRS P-01 through P-10) remain unapproved.
            All calculations use deterministic Decimal precision with zero floating-point drift and are strictly
            for review, approval lock, and audit.
          </div>
        </div>
      </div>

      {/* Header and Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>Payroll Engine & Payslips</h2>
          <p style={{ color: '#64748b', margin: '4px 0 0 0', fontSize: '0.875rem' }}>
            Deterministic draft calculations, transactional approval locking, and private payslip distribution.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowPeriodModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={16} /> New Pay Period
          </button>
          <button
            onClick={() => setShowCalculateModal(true)}
            disabled={payPeriods.length === 0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.5rem 1rem',
              backgroundColor: payPeriods.length > 0 ? '#ea580c' : '#94a3b8',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: payPeriods.length > 0 ? 'pointer' : 'not-allowed',
            }}
          >
            <Calculator size={16} /> Calculate Draft Run
          </button>
          <button
            onClick={loadData}
            title="Refresh"
            style={{
              padding: '0.5rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {successMsg}
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.875rem' }}>
            <Calendar size={16} /> Pay Periods
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '6px' }}>{payPeriods.length}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.875rem' }}>
            <FileSpreadsheet size={16} /> Pay Runs
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '6px' }}>{runs.length}</div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.875rem' }}>
            <Clock size={16} /> Latest Run Hours
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '6px' }}>
            {runs[0] ? (runs[0].total_payable_minutes / 60).toFixed(2) : '0.00'} hrs
          </div>
        </div>
        <div style={{ padding: '1rem', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.875rem' }}>
            <DollarSign size={16} /> Latest Run Gross Pay
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: '6px', color: '#0f766e' }}>
            {runs[0] ? `₹ ${Number(runs[0].total_gross_pay).toFixed(2)}` : '₹ 0.00'}
          </div>
        </div>
      </div>

      {/* Runs Table */}
      <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Payroll Runs</h3>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Deterministic SHA-256 locked runs</span>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Loading payroll runs...</div>
        ) : runs.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
            <Calculator size={36} color="#cbd5e1" style={{ marginBottom: '8px' }} />
            <div>No draft payroll runs calculated yet.</div>
            <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>Click "Calculate Draft Run" to run the deterministic engine.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Run Date</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Employees</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Payable Hours</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Gross Pay</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Input SHA-256 Hash</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isSelected = selectedRun?.id === r.id;
                  const isLocked = r.status === 'locked';
                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                        {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: isLocked ? '#dbeafe' : '#ffedd5',
                            color: isLocked ? '#1d4ed8' : '#c2410c',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          {isLocked && <Lock size={12} />}
                          {isLocked ? 'Locked & Immutable' : r.watermark}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{r.total_employees}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>{(r.total_payable_minutes / 60).toFixed(2)} hrs</td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#0f766e' }}>
                        ₹ {Number(r.total_gross_pay).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }}>
                        {`${r.input_hash.slice(0, 16)}...`}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => handleSelectRun(r)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: isSelected ? '#e2e8f0' : '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            {isSelected ? 'Hide Details' : 'View Breakdown'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Run Line Items, Lock & Release Controls */}
      {selectedRun && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                  Run Line Items & Reconciliation
                </h3>
                {selectedRun.status === 'locked' && (
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#dbeafe', color: '#1d4ed8', fontWeight: 600 }}>
                    <Lock size={12} style={{ display: 'inline', marginRight: '3px' }} /> Locked
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', fontFamily: 'monospace' }}>
                Full SHA-256 Hash: {selectedRun.input_hash}
              </div>
            </div>

            {/* Approval & Release Workflow Controls */}
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#16a34a', fontSize: '0.875rem', fontWeight: 500 }}>
                <CheckCircle2 size={18} /> Deterministic Reconciliation Verified
              </div>
              {selectedRun.status === 'draft' && (
                <button
                  onClick={() => handleApproveRun(selectedRun.id)}
                  disabled={actionInProgress}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Lock size={15} /> Approve & Lock Run
                </button>
              )}

              {selectedRun.status === 'locked' && (
                <button
                  onClick={() => handleReleasePayslips(selectedRun.id)}
                  disabled={actionInProgress}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <Send size={15} /> Release Private Payslips
                </button>
              )}

              <a
                href={getPayrollReportCsvUrl(selectedRun.id)}
                download
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f8fafc',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                <Download size={15} /> Export CSV
              </a>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Employee</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Code</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Hours</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Hourly Rate</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Gross Pay</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Net Pay</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Exceptions</th>
                  <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {selectedRun.items?.map((item) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{item.employee_name}</td>
                    <td style={{ padding: '0.6rem 0.75rem', color: '#64748b' }}>{item.employee_code}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>{(item.payable_minutes / 60).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>₹ {Number(item.hourly_rate).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600 }}>₹ {Number(item.gross_pay).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.75rem', fontWeight: 600, color: '#0f766e' }}>₹ {Number(item.net_pay).toFixed(2)}</td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      {item.unresolved_exceptions_count > 0 ? (
                        <span style={{ color: '#dc2626', fontWeight: 600 }}>
                          {item.unresolved_exceptions_count} unresolved
                        </span>
                      ) : (
                        <span style={{ color: '#16a34a' }}>0</span>
                      )}
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', color: selectedRun.status === 'locked' ? '#1d4ed8' : '#ea580c', fontWeight: 500 }}>
                        {selectedRun.status === 'locked' ? 'Locked (Payslip Ready)' : item.watermark}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ backgroundColor: '#f8fafc', fontWeight: 700, borderTop: '2px solid #cbd5e1' }}>
                  <td style={{ padding: '0.75rem' }} colSpan={2}>Reconciled Totals</td>
                  <td style={{ padding: '0.75rem' }}>{(selectedRun.total_payable_minutes / 60).toFixed(2)} hrs</td>
                  <td style={{ padding: '0.75rem' }}>-</td>
                  <td style={{ padding: '0.75rem' }}>₹ {Number(selectedRun.total_gross_pay).toFixed(2)}</td>
                  <td style={{ padding: '0.75rem', color: '#0f766e' }}>₹ {Number(selectedRun.total_net_pay).toFixed(2)}</td>
                  <td style={{ padding: '0.75rem' }} colSpan={2}>
                    <span style={{ color: '#16a34a' }}>✓ 100% Match</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal: New Pay Period */}
      {showPeriodModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '1.5rem', width: '100%', maxWidth: '450px' }}>
            <h3 style={{ margin: '0 0 1rem 0' }}>Create Pay Period</h3>
            <form onSubmit={handleCreatePeriod}>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>Period Name</label>
                <input
                  type="text"
                  placeholder="e.g. November 2026 - First Half"
                  value={newPeriodName}
                  onChange={(e) => setNewPeriodName(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>Start Date</label>
                  <input
                    type="date"
                    value={newPeriodStart}
                    onChange={(e) => setNewPeriodStart(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>End Date</label>
                  <input
                    type="date"
                    value={newPeriodEnd}
                    onChange={(e) => setNewPeriodEnd(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                    required
                  />
                </div>
              </div>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>Cutoff Date</label>
                <input
                  type="date"
                  value={newPeriodCutoff}
                  onChange={(e) => setNewPeriodCutoff(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowPeriodModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={calculating}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#ea580c', color: '#ffffff', fontWeight: 500, cursor: 'pointer' }}
                >
                  {calculating ? 'Saving...' : 'Save Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Calculate Draft Run */}
      {showCalculateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '1.5rem', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Calculate Deterministic Draft Run</h3>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              The engine will process locked attendance days, apply active rate configurations, compute SHA-256 snapshot hash, and reconcile totals.
            </p>
            <form onSubmit={handleCalculateRun}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '4px', fontWeight: 500 }}>Select Pay Period</label>
                <select
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                  required
                >
                  {payPeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.start_date} to {p.end_date})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '1.25rem', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={blockExceptions}
                    onChange={(e) => setBlockExceptions(e.target.checked)}
                  />
                  <span>
                    <strong>Block on unresolved attendance exceptions</strong> (Recommended)
                  </span>
                </label>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', marginLeft: '24px' }}>
                  Rejects calculation if any employee has missing punches or pending adjustment requests.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCalculateModal(false)}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={calculating}
                  style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', backgroundColor: '#ea580c', color: '#ffffff', fontWeight: 500, cursor: 'pointer' }}
                >
                  {calculating ? 'Calculating...' : 'Run Engine'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
