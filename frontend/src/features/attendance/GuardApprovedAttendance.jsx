import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import { LoadingState } from '../../components/common/States';
import FormField from '../../components/forms/FormField';
import { getAuthClient } from '../../services/authService';
import {
  loadSecurityWorkspace,
  releaseSecurityFlow,
} from '../../services/securityAttendanceService';
import {
  signInStationEmployee,
  loadStationContext,
  openStationVisit,
  closeStationVisit,
  stationTransport,
} from '../../services/attendanceStationService';
import PunchCard from './PunchCard';
import SecurityPresenceChecks from './SecurityPresenceChecks';

// The guard's temporary session stays in memory and never replaces the employee's
// signed-in account. Authorization is rechecked by both caller-JWT RPCs and commit.
export default function GuardApprovedAttendance({ workspace, clientId, qrToken, onRefresh }) {
  const { session } = useAuth();
  const [visit, setVisit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(null);
  const mounted = useRef(true);
  const transport = useMemo(
    () =>
      visit
        ? stationTransport(visit.employeeClient, visit.guardFlowId, visit.visit_id, visit.client)
        : null,
    [visit],
  );
  async function clear() {
    const previous = current.current;
    current.current = null;
    if (mounted.current) setVisit(null);
    if (previous) {
      if (mounted.current) {
        setBusy(true);
        setClearing(true);
      }
      await closeStationVisit(previous.guardFlowId, previous.visit_id, previous.client).catch(
        () => {},
      );
      await releaseSecurityFlow(previous.guardFlowId, previous.client).catch(() => {});
      await previous.client.auth.signOut({ scope: 'local' }).catch(() => {});
    }
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clear();
    };
  }, []);
  useEffect(() => {
    if (!visit) return;
    let active = true;
    const heartbeat = setInterval(async () => {
      try {
        const value = await loadSecurityWorkspace(visit.guardClientId, null, visit.client);
        if (value.security_flow_id !== visit.guardFlowId)
          throw new Error('Guard approval expired. Verify the guard again.');
      } catch (failure) {
        if (active) {
          setError(failure.message);
          await clear();
          if (mounted.current) onRefresh();
        }
      }
    }, 25000);
    const expiry = setTimeout(
      async () => {
        setError('This five-minute guard approval turn expired. Verify the guard again.');
        await clear();
        if (mounted.current) onRefresh();
      },
      Math.max(0, visit.deadline - Date.now()),
    );
    return () => {
      active = false;
      clearInterval(heartbeat);
      clearTimeout(expiry);
    };
  }, [visit]);
  async function authorize(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const email = form.elements.guard_email.value.trim(),
      password = form.elements.guard_password.value;
    form.reset();
    let login, guardFlowId;
    try {
      login = await signInStationEmployee(email, password);
      if (login.session.user_id === session.user_id)
        throw new Error(
          'A guard cannot approve their own attendance. Ask a different authorized guard.',
        );
      const guardClientId = crypto.randomUUID();
      const guardWorkspace = await loadSecurityWorkspace(guardClientId, null, login.client);
      guardFlowId = guardWorkspace.security_flow_id;
      await loadStationContext(guardFlowId, login.client);
      const employeeClient = await getAuthClient();
      const data = await openStationVisit(
        guardWorkspace.security_flow_id,
        employeeClient,
        clientId,
        qrToken,
        login.client,
      );
      const value = {
        ...data,
        client: login.client,
        employeeClient,
        guardFlowId: guardWorkspace.security_flow_id,
        guardClientId,
        guardName: login.session.display_name,
        deadline:
          Date.now() +
          Math.min(300000, Date.parse(data.expires_at) - Date.parse(data.workspace.server_time)),
      };
      if (!mounted.current) {
        await closeStationVisit(value.guardFlowId, value.visit_id, value.client).catch(() => {});
        await releaseSecurityFlow(value.guardFlowId, value.client).catch(() => {});
        await value.client.auth.signOut({ scope: 'local' });
        return;
      }
      current.current = value;
      setVisit(value);
    } catch (failure) {
      if (guardFlowId) await releaseSecurityFlow(guardFlowId, login.client).catch(() => {});
      await login?.client.auth.signOut({ scope: 'local' }).catch(() => {});
      if (mounted.current) setError(failure.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const actionWorkspace = visit ? { ...workspace, ...visit.workspace } : workspace;
  async function recorded() {
    await clear();
    if (mounted.current) onRefresh();
  }
  if (clearing)
    return (
      <Card>
        <LoadingState label="Clearing guard approval…" />
      </Card>
    );
  return (
    <>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!visit ? (
        <Card className="security-review-card">
          <span className="eyebrow">IN-PERSON SECURITY CHECK</span>
          <h2>Ask the guard to verify you</h2>
          <p>
            {workspace.display_name} · {workspace.attendance_id} ·{' '}
            {workspace.designation || 'Designation not set'}
          </p>
          <p>
            An HR-authorized guard at your store must check your staff ID, sign in privately and
            approve with their passkey. You will then take separate employee and guard photos.
          </p>
          <form onSubmit={authorize} className="login-form" autoComplete="off">
            <FormField
              label="Guard email"
              name="guard_email"
              type="email"
              required
              autoComplete="off"
              disabled={busy}
            />
            <FormField
              label="Guard password"
              name="guard_password"
              type="password"
              required
              autoComplete="off"
              disabled={busy}
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Verifying guard…' : 'Verify guard & continue'}
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <Card className="station-person-card">
            <p>
              Guard: <strong>{visit.guardName}</strong> · Approval applies to one attendance action.
            </p>
            <Button
              variant="text"
              onClick={async () => {
                await clear();
                onRefresh();
              }}
            >
              Cancel guard approval
            </Button>
          </Card>
          <PunchCard
            workspace={actionWorkspace}
            securityFlowId={actionWorkspace.security_flow_id}
            transport={transport}
            witnessName={visit.guardName}
            onRecorded={recorded}
            onRefresh={onRefresh}
          />
          <SecurityPresenceChecks
            workspace={actionWorkspace}
            flowId={actionWorkspace.security_flow_id}
            transport={transport}
            witnessName={visit.guardName}
            onRecorded={recorded}
          />
        </>
      )}
    </>
  );
}
