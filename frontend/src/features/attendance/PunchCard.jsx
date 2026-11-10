import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock3, LogIn, LogOut, RefreshCw } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { recordAttendance, verifyAttendanceQr } from '../../services/attendanceService';
import { captureAttendanceLocation, LOCATION_NOTICE_VERSION } from '../../services/locationService';
import { dateLabel, momentLabel } from './attendanceFormat';
import AttendanceCapture from './AttendanceCapture';
import { EVIDENCE_NOTICE_VERSION } from '../../services/attendanceCaptureService';

export default function PunchCard({ workspace, onRecorded, onRefresh }) {
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [capturing, setCapturing] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const clockedIn = workspace.status === 'clocked_in';
  const blocked = !clockedIn && (!workspace.shift || !workspace.site_active);
  const locationReady =
    workspace.location_required === true &&
    workspace.location_notice_version === LOCATION_NOTICE_VERSION;
  const storePolicyReady =
    workspace.store_geofence_required === true &&
    workspace.store_geofence_policy === 'store-radius-v1';
  const area = workspace.attendance_area;
  const evidenceReady =
    workspace.evidence_required === true &&
    workspace.evidence_notice_version === EVIDENCE_NOTICE_VERSION;
  const areaReady =
    storePolicyReady && area?.configured === true && Number.isFinite(area.radius_meters);
  async function punch(evidence) {
    if (
      busy.current ||
      !locationReady ||
      !storePolicyReady ||
      !evidenceReady ||
      (!pending && (!consent || blocked || !areaReady))
    )
      return;
    busy.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    let action = pending;
    try {
      if (!action) {
        setLocating(true);
        const location = await captureAttendanceLocation();
        if (!active.current) return;
        setLocating(false);
        action = {
          id: crypto.randomUUID(),
          type: clockedIn ? 'clock_out' : 'clock_in',
          previousId: workspace.last_event_id,
          employeeId: workspace.employee_id,
          location,
          evidence,
        };
      }
      const receipt = await recordAttendance(action);
      if (!active.current) return;
      if (
        !receipt?.id ||
        receipt.event_type !== action.type ||
        receipt.location_saved !== true ||
        receipt.photo_saved !== true ||
        receipt.qr_verified !== true ||
        !Number.isFinite(Date.parse(receipt.occurred_at))
      ) {
        setPending(action);
        throw Object.assign(
          new Error('The result could not be confirmed. Check this request again.'),
          { retryable: true },
        );
      }
      setPending(null);
      const message =
        (action.type === 'clock_in' ? 'Clock-in' : 'Clock-out') +
        ' with photo and location saved at ' +
        momentLabel(receipt.occurred_at, workspace.shift?.timezone || workspace.timezone) +
        '.';
      setConsent(false);
      setNotice(message);
      onRecorded(message);
    } catch (failure) {
      if (!active.current) return;
      setError(failure.message);
      if (failure.retryable) setPending(action);
      else setPending(null);
    } finally {
      busy.current = false;
      if (active.current) {
        setSaving(false);
        setLocating(false);
        setCapturing(false);
      }
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
      {!storePolicyReady ? (
        <p className="notice">
          Store distance checks are not installed yet. Ask your project administrator to apply
          attendance migration 0007 and deploy the latest frontend.
        </p>
      ) : areaReady ? (
        <p className="notice">
          Clock in and out within {area.radius_meters} metres of {area.site_name}. Each punch
          requires a store QR scan, photo and fresh location after you agree. Low location accuracy
          can prevent a punch near the boundary.
        </p>
      ) : (
        <p className="notice">
          HR must set this store’s attendance area in Sites &amp; Shifts before you can clock in or
          out.
        </p>
      )}
      {locationReady ? (
        <div className="attendance-location-consent">
          <p>
            Your photo and device location are saved with this attendance event for attendance
            verification. You and HR can view them. Accuracy depends on your device.
          </p>
          <label>
            <input
              type="checkbox"
              checked={consent}
              disabled={saving || Boolean(pending)}
              onChange={(event) => setConsent(event.target.checked)}
            />
            I agree to share my photo and location for this attendance event.
          </label>
        </div>
      ) : (
        <p className="notice">
          Location capture is not installed yet. Ask your project administrator to apply attendance
          migration 0006 and deploy the latest frontend.
        </p>
      )}
      {!evidenceReady && (
        <p className="notice">
          QR and photo attendance is not installed yet. Ask your project administrator to apply
          attendance migration 0008 and deploy the latest frontend.
        </p>
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
        <Button
          onClick={() => (pending ? punch() : setCapturing(true))}
          disabled={
            saving ||
            !locationReady ||
            !storePolicyReady ||
            !evidenceReady ||
            ((!areaReady || blocked || !consent) && !pending)
          }
        >
          {clockedIn ? (
            <LogOut size={18} aria-hidden="true" />
          ) : (
            <LogIn size={18} aria-hidden="true" />
          )}
          {saving
            ? locating
              ? 'Getting location…'
              : 'Recording…'
            : pending
              ? 'Check attendance request'
              : clockedIn
                ? 'Clock out'
                : 'Clock in'}
          <ArrowRight size={17} aria-hidden="true" />
        </Button>
        <Button
          variant="secondary"
          onClick={onRefresh}
          disabled={saving || Boolean(pending) || capturing}
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh status
        </Button>
      </div>
      <p className="field-hint">
        Clock out when you finish. Overnight attendance stays on the date your shift started.
      </p>
      {capturing && (
        <AttendanceCapture
          verifyQr={verifyAttendanceQr}
          clockedIn={clockedIn}
          siteName={area.site_name}
          onConfirm={punch}
          onClose={() => setCapturing(false)}
          busy={saving}
        />
      )}
    </Card>
  );
}
