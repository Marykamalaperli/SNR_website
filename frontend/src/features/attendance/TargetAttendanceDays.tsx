import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Clock, Download, Filter, RefreshCw, Edit3 } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import FormField from '../../components/forms/FormField';
import StatusBadge from '../../components/common/StatusBadge';
import {
  AttendanceDay,
  listAttendanceDays,
  listMyAttendanceDays,
  requestAttendanceAdjustment,
  reviewAttendanceAdjustment,
  listAttendanceAdjustments,
  AttendanceAdjustment,
  getAttendanceReportCsvUrl,
} from '../../services/targetAttendanceService';

interface Props {
  role?: 'employee' | 'store_admin' | 'hr_payroll' | 'system_admin' | 'auditor';
  storeId?: string;
}

export default function TargetAttendanceDays({ role = 'employee', storeId }: Props) {
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedDay, setSelectedDay] = useState<AttendanceDay | null>(null);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustFirstIn, setAdjustFirstIn] = useState('');
  const [adjustLastOut, setAdjustLastOut] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Pending adjustments for review (HR/Store Admin)
  const [pendingAdjustments, setPendingAdjustments] = useState<AttendanceAdjustment[]>([]);
  const [reviewModalAdj, setReviewModalAdj] = useState<AttendanceAdjustment | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const fetchDays = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      if (role === 'employee') {
        const resp = await listMyAttendanceDays();
        setDays(resp.items);
      } else {
        const params: { store_id?: string; status?: string } = {};
        if (storeId) params.store_id = storeId;
        if (statusFilter !== 'all') params.status = statusFilter;
        const resp = await listAttendanceDays(params);
        setDays(resp.items);

        if (role === 'hr_payroll' || role === 'system_admin') {
          const adjList = await listAttendanceAdjustments({ status: 'pending_approval' });
          setPendingAdjustments(adjList);
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance days.');
    } finally {
      setLoading(false);
    }
  }, [role, storeId, statusFilter]);

  useEffect(() => {
    fetchDays();
  }, [fetchDays]);

  const handleOpenAdjustModal = (day: AttendanceDay) => {
    setSelectedDay(day);
    setAdjustReason('');
    setAdjustError(null);
    if (day.first_in) {
      setAdjustFirstIn(day.first_in.slice(0, 16));
    } else {
      setAdjustFirstIn(`${day.work_date}T09:00`);
    }
    if (day.last_out) {
      setAdjustLastOut(day.last_out.slice(0, 16));
    } else {
      setAdjustLastOut(`${day.work_date}T18:00`);
    }
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDay) return;
    if (adjustReason.trim().length < 5) {
      setAdjustError('Please provide a descriptive reason of at least 5 characters.');
      return;
    }
    try {
      setAdjustSubmitting(true);
      setAdjustError(null);
      await requestAttendanceAdjustment(selectedDay.id, {
        first_in: adjustFirstIn ? new Date(adjustFirstIn).toISOString() : null,
        last_out: adjustLastOut ? new Date(adjustLastOut).toISOString() : null,
        reason: adjustReason.trim(),
        expected_version: selectedDay.version,
      });
      setSelectedDay(null);
      setSuccessMessage('Attendance adjustment submitted successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
      fetchDays();
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : 'Adjustment submission failed.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleReviewDecision = async (decision: 'approve' | 'reject') => {
    if (!reviewModalAdj) return;
    try {
      setReviewSubmitting(true);
      await reviewAttendanceAdjustment(reviewModalAdj.id, {
        action: decision,
        review_note: reviewNote.trim() || undefined,
      });
      setReviewModalAdj(null);
      setReviewNote('');
      setSuccessMessage(`Adjustment ${decision}d successfully.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      fetchDays();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Review action failed.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            {role === 'employee'
              ? 'My Daily Attendance & Exceptions'
              : 'Daily Attendance Records & Exceptions'}
          </h2>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Daily summaries, punch exceptions, and audited corrections
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {role !== 'employee' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Filter size={16} color="#6b7280" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: '0.375rem 0.625rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem',
                  background: '#fff',
                }}
              >
                <option value="all">All statuses</option>
                <option value="present">Present</option>
                <option value="missing_punch">Missing Punch</option>
                <option value="adjusted">Adjusted</option>
              </select>
            </div>
          )}
          {role !== 'employee' && (
            <a
              href={getAttendanceReportCsvUrl({
                from_date: '2026-01-01',
                to_date: new Date().toISOString().slice(0, 10),
                store_id: storeId,
              })}
              download
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.375rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                background: '#fff',
                color: '#374151',
                fontSize: '0.875rem',
                textDecoration: 'none',
              }}
            >
              <Download size={14} />
              Export CSV
            </a>
          )}
          <Button variant="secondary" onClick={fetchDays} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>
      </div>

      {successMessage && (
        <div
          role="status"
          style={{
            padding: '0.75rem 1rem',
            background: '#ecfdf5',
            color: '#065f46',
            borderRadius: '6px',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle size={18} />
          {successMessage}
        </div>
      )}

      {/* Pending Approvals Queue for HR */}
      {pendingAdjustments.length > 0 && (role === 'hr_payroll' || role === 'system_admin') && (
        <Card style={{ marginBottom: '1.5rem', borderLeft: '4px solid #f59e0b' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', color: '#b45309' }}>
            Pending Attendance Corrections ({pendingAdjustments.length})
          </h3>
          <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Store administrators requested the following corrections. Review and approve or reject.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Requested At</th>
                  <th style={{ padding: '0.5rem' }}>Reason</th>
                  <th style={{ padding: '0.5rem' }}>Proposed Times</th>
                  <th style={{ padding: '0.5rem' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingAdjustments.map((adj) => (
                  <tr key={adj.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '0.5rem' }}>
                      {new Date(adj.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{adj.reason}</td>
                    <td style={{ padding: '0.5rem' }}>
                      In:{' '}
                      {adj.after_json.first_in
                        ? new Date(String(adj.after_json.first_in)).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'None'}{' '}
                      | Out:{' '}
                      {adj.after_json.last_out
                        ? new Date(String(adj.after_json.last_out)).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'None'}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <Button
                        onClick={() => {
                          setReviewModalAdj(adj);
                          setReviewNote('');
                        }}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '1.5rem', color: '#b91c1c' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 0.5rem' }} />
            <p>{error}</p>
            <Button variant="secondary" onClick={fetchDays} style={{ marginTop: '0.75rem' }}>
              Try Again
            </Button>
          </div>
        </Card>
      )}

      {!loading && !error && days.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            <Clock size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
            <p style={{ margin: 0, fontWeight: 500 }}>No attendance day records found.</p>
            <span style={{ fontSize: '0.875rem' }}>
              Daily summaries update automatically when employees clock in and out.
            </span>
          </div>
        </Card>
      )}

      {!loading && days.length > 0 && (
        <Card>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem' }}>Date</th>
                  {role !== 'employee' && <th style={{ padding: '0.75rem' }}>Employee</th>}
                  <th style={{ padding: '0.75rem' }}>First In</th>
                  <th style={{ padding: '0.75rem' }}>Last Out</th>
                  <th style={{ padding: '0.75rem' }}>Payable Hours</th>
                  <th style={{ padding: '0.75rem' }}>Exceptions</th>
                  <th style={{ padding: '0.75rem' }}>Status</th>
                  {role !== 'auditor' && <th style={{ padding: '0.75rem' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => {
                  const hours = (day.payable_minutes / 60).toFixed(1);
                  return (
                    <tr key={day.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>
                        {new Date(day.work_date + 'T00:00:00').toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {role !== 'employee' && (
                        <td style={{ padding: '0.75rem' }}>
                          <div>{day.employee_name || 'Employee'}</div>
                          <small style={{ color: '#6b7280' }}>{day.employee_code || ''}</small>
                        </td>
                      )}

                      <td style={{ padding: '0.75rem' }}>
                        {day.first_in ? (
                          new Date(day.first_in).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>Missing</span>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem' }}>
                        {day.last_out ? (
                          new Date(day.last_out).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          <span style={{ color: '#dc2626', fontWeight: 500 }}>Missing</span>
                        )}
                      </td>

                      <td style={{ padding: '0.75rem' }}>{hours} hrs</td>

                      <td style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {day.is_missing_punch && (
                            <span
                              style={{
                                background: '#fef2f2',
                                color: '#b91c1c',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              Missing punch
                            </span>
                          )}
                          {day.is_late && (
                            <span
                              style={{
                                background: '#fffbeb',
                                color: '#b45309',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              Late ({day.late_minutes}m)
                            </span>
                          )}
                          {day.is_early_departure && (
                            <span
                              style={{
                                background: '#fffbeb',
                                color: '#b45309',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              Early ({day.early_departure_minutes}m)
                            </span>
                          )}
                          {day.is_overtime && (
                            <span
                              style={{
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                              }}
                            >
                              OT (+{day.overtime_minutes}m)
                            </span>
                          )}
                          {!day.is_missing_punch &&
                            !day.is_late &&
                            !day.is_early_departure &&
                            !day.is_overtime && (
                              <span style={{ color: '#10b981', fontSize: '0.75rem' }}>Normal</span>
                            )}
                        </div>
                      </td>

                      <td style={{ padding: '0.75rem' }}>
                        <StatusBadge
                          tone={
                            day.status === 'present'
                              ? 'positive'
                              : day.status === 'adjusted'
                                ? 'informative'
                                : 'attention'
                          }
                        >
                          {day.status.replace('_', ' ')}
                        </StatusBadge>
                      </td>

                      {role !== 'auditor' && (
                        <td style={{ padding: '0.75rem' }}>
                          <Button
                            variant="secondary"
                            onClick={() => handleOpenAdjustModal(day)}
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                          >
                            <Edit3 size={12} />
                            Adjust
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal: Request / Apply Adjustment */}
      {selectedDay && (
        <Modal
          title={`Adjust Attendance for ${new Date(selectedDay.work_date + 'T00:00:00').toLocaleDateString()}`}
          onClose={() => setSelectedDay(null)}
        >
          <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Raw punch events remain immutable. This correction will create an append-only audit
            adjustment and recalculate daily summary hours.
          </p>

          {adjustError && (
            <div
              style={{
                padding: '0.75rem',
                background: '#fef2f2',
                color: '#b91c1c',
                borderRadius: '6px',
                marginBottom: '1rem',
                fontSize: '0.875rem',
              }}
            >
              {adjustError}
            </div>
          )}

          <form onSubmit={handleSubmitAdjustment}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <FormField label="First In (Local Time)">
                {(props) => (
                  <input
                    {...props}
                    type="datetime-local"
                    value={adjustFirstIn}
                    onChange={(e) => setAdjustFirstIn(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Last Out (Local Time)">
                {(props) => (
                  <input
                    {...props}
                    type="datetime-local"
                    value={adjustLastOut}
                    onChange={(e) => setAdjustLastOut(e.target.value)}
                  />
                )}
              </FormField>
            </div>

            <FormField
              label="Correction Reason (Mandatory)"
              hint="Explain why this adjustment is needed for audit and compliance."
            >
              {(props) => (
                <textarea
                  {...props}
                  rows={3}
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Employee forgot to clock out at shift end; verified with store manager."
                />
              )}
            </FormField>

            <div
              style={{
                marginTop: '1.25rem',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}
            >
              <Button
                variant="secondary"
                onClick={() => setSelectedDay(null)}
                disabled={adjustSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={adjustSubmitting}>
                {adjustSubmitting ? 'Submitting…' : 'Submit Adjustment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: HR Review Pending Adjustment */}
      {reviewModalAdj && (
        <Modal title="Review Attendance Correction Request" onClose={() => setReviewModalAdj(null)}>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
            <p>
              <strong>Reason:</strong> {reviewModalAdj.reason}
            </p>
            <p>
              <strong>Before:</strong> In: {String(reviewModalAdj.before_json.first_in || 'None')} |
              Out: {String(reviewModalAdj.before_json.last_out || 'None')}
            </p>
            <p>
              <strong>After:</strong> In: {String(reviewModalAdj.after_json.first_in || 'None')} |
              Out: {String(reviewModalAdj.after_json.last_out || 'None')}
            </p>
          </div>

          <FormField label="Review Notes (Optional)">
            {(props) => (
              <textarea
                {...props}
                rows={2}
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="e.g. Approved per store timesheet verification."
              />
            )}
          </FormField>

          <div
            style={{
              marginTop: '1.25rem',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.75rem',
            }}
          >
            <Button
              variant="secondary"
              onClick={() => handleReviewDecision('reject')}
              disabled={reviewSubmitting}
            >
              Reject Request
            </Button>
            <Button onClick={() => handleReviewDecision('approve')} disabled={reviewSubmitting}>
              Approve Request
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
