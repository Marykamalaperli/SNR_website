import { useCallback, useEffect, useState } from 'react';
import { Camera, Timer, ShieldCheck } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import AttendanceCapture from './AttendanceCapture';
import { captureAttendanceLocation } from '../../services/locationService';
import { validateAttendanceLocation } from '../../services/attendanceService';
import {
  loadSecurityChecks,
  verifyAttendanceIdentity,
  recordSecurityCheck,
} from '../../services/securityAttendanceService';

export default function SecurityPresenceChecks({
  flowId,
  workspace,
  transport = null,
  witnessName = null,
  onRecorded,
}) {
  const loadChecks = transport?.loadChecks || loadSecurityChecks;
  const validateLocation = transport?.validateLocation || validateAttendanceLocation;
  const verifyIdentity = transport?.verifyIdentity || verifyAttendanceIdentity;
  const recordCheck = transport?.recordCheck || recordSecurityCheck;
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [captureId, setCaptureId] = useState(null);
  const [consentId, setConsentId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(() => Date.now());
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true,
      running = false;
    const poll = async () => {
      if (running) return;
      running = true;
      try {
        const data = await loadChecks(flowId);
        if (active) {
          setStatus({ ...data, offset: Date.parse(data.server_time) - Date.now() });
          setError('');
        }
      } catch (failure) {
        if (active) setError(failure.message);
      } finally {
        running = false;
      }
    };
    poll();
    const timer = setInterval(poll, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [flowId, revision, loadChecks]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const check = status?.current;
  const remaining = check
    ? Math.max(0, Math.ceil((Date.parse(check.expires_at) - (tick + (status.offset || 0))) / 1000))
    : 0;
  const checkSessionId = check?.session_id;
  const checkLocation = useCallback(async () => {
    const location = await captureAttendanceLocation();
    await validateLocation(
      {
        securityFlowId: flowId,
        employeeId: workspace.employee_id,
        type: 'clock_out',
        previousId: checkSessionId,
      },
      location,
    );
    return location;
  }, [flowId, workspace.employee_id, checkSessionId, validateLocation]);
  async function confirm(evidence) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    let action = pending;
    try {
      if (!action) {
        action = {
          id: crypto.randomUUID(),
          employeeId: workspace.employee_id,
          type: 'security_check',
          previousId: check.session_id,
          checkId: check.id,
          location: evidence.photo.location_at_capture,
          evidence,
          securityFlowId: flowId,
        };
        action = { ...action, identityId: await verifyIdentity(flowId, action) };
      }
      const receipt = await recordCheck(action);
      if (
        receipt.id !== action.id ||
        receipt.photo_saved !== true ||
        receipt.location_saved !== true
      )
        throw Object.assign(
          new Error('The photo result could not be confirmed. Check the same request.'),
          { retryable: true },
        );
      setPending(null);
      setConsentId(null);
      setNotice('Your security photo check was recorded.');
      setRevision((v) => v + 1);
      onRecorded?.('The security photo check was recorded.');
    } catch (failure) {
      setError(failure.message);
      setPending(failure.retryable ? action : null);
    } finally {
      setBusy(false);
      setCaptureId(null);
    }
  }
  return (
    <Card className="security-presence-card">
      <span className="eyebrow">
        <ShieldCheck size={17} />
        SHIFT PHOTO CHECKS
      </span>
      <h2>Stay present during your shift</h2>
      <p>
        {workspace.security_checks_per_shift
          ? `${workspace.security_checks_per_shift} random photo checks are enabled for your future clock-ins. Keep this page open while on duty.`
          : 'HR has not enabled random checks for future clock-ins on this account.'}
      </p>
      <p>
        Only requested photo locations are collected. A missed check is flagged for HR review; it
        does not change recorded attendance.
      </p>
      {status && (
        <p>
          {status.completed} completed · {status.missed} missed · {status.total} scheduled for this
          open attendance session
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {check && remaining > 0 && !pending && (
        <div className="security-check-alert" role="alert">
          <h3>
            <Timer size={20} />
            Photo check requested
          </h3>
          <p>
            Respond within <strong>{remaining} seconds</strong>. Verify your location within 50
            metres and take a fresh selfie now.
          </p>
          <label>
            <input
              type="checkbox"
              checked={consentId === check.id}
              onChange={(event) => setConsentId(event.target.checked ? check.id : null)}
              disabled={busy}
            />
            I agree to save this photo and location for my security check.
          </label>
          <Button
            onClick={() => setCaptureId(check.id)}
            disabled={consentId !== check.id || busy || Boolean(error)}
          >
            <Camera size={18} />
            Verify now
          </Button>
        </div>
      )}
      {check && remaining === 0 && !pending && (
        <p className="notice">
          This photo-check window has closed. HR can review the missed check.
        </p>
      )}
      {pending && (
        <Button onClick={() => confirm()} disabled={busy}>
          {busy ? 'Checking…' : 'Check security photo request'}
        </Button>
      )}
      {captureId === check?.id && check && (remaining > 0 || busy) && (
        <AttendanceCapture
          title="Security photo check"
          confirmLabel="Confirm security photo"
          siteName={workspace.site_name}
          checkLocation={checkLocation}
          onConfirm={confirm}
          onClose={() => setCaptureId(null)}
          busy={busy}
          witnessName={witnessName}
          employeeName={
            workspace.display_name +
            (workspace.employee_number ? ' (staff ID ' + workspace.employee_number + ')' : '')
          }
        />
      )}
    </Card>
  );
}
