import { useRef, useState } from 'react';
import { ArrowRight, Clock3, LogIn, LogOut, RefreshCw } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { recordAttendance } from '../../services/attendanceService';
import { dateLabel, momentLabel } from './attendanceFormat';

export default function PunchCard({ workspace, onRecorded, onRefresh }) {
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const clockedIn = workspace.status === 'clocked_in';
  const blocked = !clockedIn && (!workspace.shift || !workspace.site_active);
  async function punch() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    const action = pending || {
      id: crypto.randomUUID(),
      type: clockedIn ? 'clock_out' : 'clock_in',
      previousId: workspace.last_event_id,
    };
    try {
      const receipt = await recordAttendance(action);
      if (
        !receipt?.id ||
        receipt.event_type !== action.type ||
        !Number.isFinite(Date.parse(receipt.occurred_at))
      ) {
        setPending(action);
        throw Object.assign(
          new Error('The result could not be confirmed. Check this request again.'),
          { retryable: true },
        );
      }
      setPending(null);
      const message = `${action.type === 'clock_in' ? 'Clock-in' : 'Clock-out'} recorded at ${momentLabel(receipt.occurred_at, workspace.shift?.timezone || workspace.timezone)}.`;
      setNotice(message);
      onRecorded(message);
    } catch (failure) {
      setError(failure.message);
      if (failure.retryable) setPending(action);
      else setPending(null);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  return (
    <Card className="live-punch-card">
      <div className="live-punch-top">
        <span className="feature-icon tone-orange">
          <Clock3 aria-hidden="true" />
        </span>
        <StatusBadge tone={clockedIn ? 'positive' : 'neutral'}>
          {clockedIn ? 'Clocked in' : 'Clocked out'}
        </StatusBadge>
      </div>
      <h2>{clockedIn ? 'Your workday is underway' : 'Ready for your workday?'}</h2>
      <p className="muted">
        {clockedIn
          ? `Clocked in ${momentLabel(workspace.open_since, workspace.shift?.timezone || workspace.timezone)}.`
          : 'Clock in when you start. Your recorded time will appear in your history.'}
      </p>
      {workspace.shift ? (
        <dl className="live-shift-details">
          <div>
            <dt>Assigned shift</dt>
            <dd>{workspace.shift.name}</dd>
          </div>
          <div>
            <dt>Work date</dt>
            <dd>{dateLabel(workspace.shift.work_date)}</dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>
              {momentLabel(workspace.shift.scheduled_start, workspace.shift.timezone)} –{' '}
              {momentLabel(workspace.shift.scheduled_end, workspace.shift.timezone)}
            </dd>
          </div>
          <div>
            <dt>Site · time zone</dt>
            <dd>
              {workspace.site_name} · {workspace.shift.timezone}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="notice">Ask HR to assign your shift before clocking in.</p>
      )}
      {!workspace.site_active && !clockedIn && (
        <p className="notice">Your work site is inactive. Contact HR.</p>
      )}
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {pending && (
        <p className="field-hint">
          The connection stopped before the result was confirmed. Check the same request to avoid a
          duplicate punch.
        </p>
      )}
      <div className="live-punch-actions">
        <Button onClick={punch} disabled={saving || (blocked && !pending)}>
          {clockedIn ? (
            <LogOut size={18} aria-hidden="true" />
          ) : (
            <LogIn size={18} aria-hidden="true" />
          )}
          {saving
            ? 'Recording…'
            : pending
              ? 'Check attendance request'
              : clockedIn
                ? 'Clock out'
                : 'Clock in'}
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
        <Button variant="secondary" onClick={onRefresh} disabled={saving || Boolean(pending)}>
          <RefreshCw size={16} aria-hidden="true" />
          Refresh status
        </Button>
      </div>
      <p className="field-hint">
        Clock out when you finish. Overnight attendance stays on the date your shift started.
      </p>
    </Card>
  );
}
