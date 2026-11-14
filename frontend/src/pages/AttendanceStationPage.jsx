import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { QrCode, ShieldCheck, UsersRound, LogOut } from 'lucide-react';
import Brand from '../components/common/Brand';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import FormField from '../components/forms/FormField';
import { ErrorState, LoadingState } from '../components/common/States';
import { useAuth } from '../hooks/useAuth';
import useRemoteData from '../hooks/useRemoteData';
import usePageMeta from '../hooks/usePageMeta';
import { attendanceRpc } from '../services/attendanceService';
import { loadSecurityWorkspace, releaseSecurityFlow } from '../services/securityAttendanceService';
import {
  signInStationEmployee,
  loadStationContext,
  loadStationDue,
  openStationVisit,
  closeStationVisit,
  stationTransport,
} from '../services/attendanceStationService';
import PunchCard from '../features/attendance/PunchCard';
import SecurityPresenceChecks from '../features/attendance/SecurityPresenceChecks';
import '../styles/security-attendance.css';

function SharedStation() {
  const { session, signOut } = useAuth();
  const [clientId] = useState(() => {
    try {
      const key = 'snr-security-client:' + session.user_id;
      const id = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, id);
      return id;
    } catch {
      return crypto.randomUUID();
    }
  });
  const loader = useCallback(async () => {
    const workspace = await loadSecurityWorkspace(clientId);
    const context = await loadStationContext(workspace.security_flow_id);
    return { ...context, flowId: workspace.security_flow_id };
  }, [clientId]);
  const guard = useRemoteData(loader);
  const [visit, setVisit] = useState(null);
  const employeeRef = useRef(null);
  const active = useRef(true);
  const starting = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [paused, setPaused] = useState(''),
    [notice, setNotice] = useState('');
  const [due, setDue] = useState([]);
  const [serverOffset, setServerOffset] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const flowId = guard.data?.flowId;
  const employeeClient = visit?.client,
    visitId = visit?.visit_id;
  const transport = useMemo(
    () => (employeeClient ? stationTransport(employeeClient, flowId, visitId) : null),
    [employeeClient, visitId, flowId],
  );
  const finish = useCallback(async (message = '') => {
    starting.current = true;
    setBusy(true);
    const current = employeeRef.current;
    employeeRef.current = null;
    setVisit(null);
    setNotice(message);
    setError('');
    if (current) {
      await closeStationVisit(current.guardFlowId, current.visit_id).catch(() => {});
      await current.client.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    starting.current = false;
    if (active.current) setBusy(false);
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      const current = employeeRef.current;
      employeeRef.current = null;
      if (current) {
        closeStationVisit(current.guardFlowId, current.visit_id).catch(() => {});
        current.client.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    };
  }, []);
  useEffect(() => {
    if (!flowId) return;
    let alive = true,
      running = false;
    const heartbeat = async () => {
      if (running) return;
      running = true;
      try {
        const guardWorkspace = await loadSecurityWorkspace(clientId);
        if (guardWorkspace.security_flow_id !== flowId)
          throw new Error('Refresh the shared device before continuing.');
        const requests = await loadStationDue(flowId);
        const current = employeeRef.current;
        if (current) {
          const workspace = await attendanceRpc(
            'security_attendance_workspace',
            { p_client_id: current.clientId },
            current.client,
          );
          if (workspace.security_flow_id !== current.workspace.security_flow_id)
            throw new Error(
              'The employee turn expired. End this turn and ask the employee to sign in again.',
            );
        }
        if (alive) {
          setDue(requests.requests);
          setServerOffset(Date.parse(requests.server_time) - Date.now());
          setPaused('');
        }
      } catch (failure) {
        if (alive) setPaused(failure.message);
      } finally {
        running = false;
      }
    };
    heartbeat();
    const timer = setInterval(heartbeat, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [flowId, clientId]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!visit) return;
    const timeout = setTimeout(
      () =>
        finish(
          'This employee turn timed out and was cleared. Sign in again to check the latest attendance status before continuing.',
        ),
      Math.max(0, visit.localDeadline - Date.now()),
    );
    return () => clearTimeout(timeout);
  }, [visit, finish]);
  async function start(event) {
    event.preventDefault();
    if (starting.current || employeeRef.current) return;
    starting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    form.reset();
    let login;
    try {
      login = await signInStationEmployee(email, password);
      const employeeClientId = crypto.randomUUID();
      let data;
      try {
        data = await openStationVisit(flowId, login.client, employeeClientId);
      } catch (failure) {
        if (!failure.retryable) throw failure;
        data = await openStationVisit(flowId, login.client, employeeClientId);
      }
      if (!active.current) {
        await closeStationVisit(flowId, data.visit_id).catch(() => {});
        await login.client.auth.signOut({ scope: 'local' });
        return;
      }
      const current = {
        ...data,
        client: login.client,
        clientId: employeeClientId,
        guardFlowId: flowId,
        localDeadline:
          Date.now() +
          Math.min(
            300000,
            Math.max(0, Date.parse(data.expires_at) - Date.parse(data.workspace.server_time)),
          ),
      };
      employeeRef.current = current;
      setVisit(current);
    } catch (failure) {
      await login?.client.auth.signOut({ scope: 'local' }).catch(() => {});
      if (active.current) setError(failure.message);
    } finally {
      starting.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function refreshEmployee() {
    try {
      const workspace = await attendanceRpc(
        'security_attendance_workspace',
        { p_client_id: visit.clientId },
        visit.client,
      );
      setVisit((current) =>
        current
          ? {
              ...current,
              workspace: { ...workspace, employee_number: current.workspace.employee_number },
            }
          : current,
      );
    } catch (failure) {
      setError(failure.message);
    }
  }
  async function leave() {
    await finish();
    if (flowId) await releaseSecurityFlow(flowId).catch(() => {});
    await signOut();
  }
  return (
    <main className="security-attendance" id="main-content">
      <header className="security-header">
        <Brand />
        <div className="security-header-actions">
          <Button
            href="/attendance/qr"
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            <QrCode size={19} /> Open attendance QR
          </Button>
          <Button variant="text" onClick={leave} disabled={busy}>
            <LogOut size={18} /> Sign out guard
          </Button>
        </div>
      </header>
      <section className="security-intro">
        <span className="eyebrow">
          <UsersRound size={18} /> SHARED ATTENDANCE DEVICE
        </span>
        <h1>Help one person at a time.</h1>
        <p>
          Guard: <strong>{session.display_name}</strong>
          {guard.data && <> · {guard.data.site_name}</>}. Ask the employee to enter their own
          sign-in. Check their staff ID and live photo before approving with your passkey.
        </p>
      </section>
      {guard.loading && <LoadingState label="Checking guard authorization…" />}
      {guard.error && (
        <Card className="security-review-card">
          <ErrorState
            title="Guard authorization required"
            description={guard.error}
            onRetry={guard.reload}
          />
          <p>
            HR must approve your attendance passkey and enable shared-device duty for your assigned
            site.
          </p>
          <Button to="/attendance">Set up my passkey</Button>
        </Card>
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
      {paused && (
        <p className="form-error" role="alert">
          {paused}
        </p>
      )}
      {guard.data && (
        <div className="security-content">
          <section aria-label="Shared-device employee attendance">
            {!visit ? (
              <Card className="security-review-card">
                <span className="eyebrow">STEP 1 · EMPLOYEE SIGN-IN</span>
                <h2>Employee, enter your own credentials</h2>
                <p>
                  Your password stays private. Do not give it to the guard or let another employee
                  sign in for you.
                </p>
                <form onSubmit={start} className="login-form" autoComplete="off">
                  <FormField
                    label="Employee email"
                    type="email"
                    name="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    required
                    disabled={busy || Boolean(paused)}
                  />
                  <FormField
                    label="Employee password"
                    type="password"
                    name="password"
                    autoComplete="off"
                    required
                    disabled={busy || Boolean(paused)}
                  />
                  <Button type="submit" disabled={busy || Boolean(paused)}>
                    {busy ? 'Verifying employee…' : 'Continue to photo & location'}
                  </Button>
                </form>
                <Button
                  variant="text"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await closeStationVisit(flowId, null);
                      setError('');
                      setNotice('Previous employee turn cleared. The next employee can sign in.');
                    } catch (failure) {
                      setError(failure.message);
                    }
                  }}
                >
                  Clear an interrupted employee turn
                </Button>
              </Card>
            ) : (
              <>
                <Card className="station-person-card">
                  <span className="eyebrow">STEP 2 · CHECK THE PERSON & STAFF ID</span>
                  <h2>{visit.workspace.display_name}</h2>
                  <p>
                    <strong>Staff ID: {visit.workspace.employee_number}</strong>
                  </p>
                  <p>
                    Only this employee’s attendance can be recorded. This turn clears after one
                    punch or five minutes.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => finish('Employee signed out. Ready for the next person.')}
                  >
                    End employee turn
                  </Button>
                </Card>
                {!paused && (
                  <>
                    <PunchCard
                      workspace={visit.workspace}
                      securityFlowId={visit.workspace.security_flow_id}
                      transport={transport}
                      witnessName={session.display_name}
                      onRecorded={finish}
                      onRefresh={refreshEmployee}
                    />
                    <SecurityPresenceChecks
                      workspace={visit.workspace}
                      flowId={visit.workspace.security_flow_id}
                      transport={transport}
                      witnessName={session.display_name}
                      onRecorded={finish}
                    />
                  </>
                )}
              </>
            )}
          </section>
          <aside className="security-guide">
            <Card>
              <h2>
                <ShieldCheck size={21} /> Three simple checks
              </h2>
              <ol>
                <li>Employee signs in privately with their own account.</li>
                <li>Verify location, then take their live photo.</li>
                <li>
                  Check the employee’s staff ID in person. Confirm with your own guard passkey.
                </li>
              </ol>
              <p>
                Never approve your own attendance here. Use your personal attendance screen or ask
                another authorized guard.
              </p>
            </Card>
            <Card className="station-due-card">
              <h2>Photo checks due now</h2>
              <p>
                Ask the named employee to come to this device and sign in. Each request expires
                after two minutes. Keep this screen open while on duty.
              </p>
              {due
                .filter((request) => Date.parse(request.expires_at) > tick + serverOffset)
                .map((request) => (
                  <p className="security-check-alert" key={request.id} role="alert">
                    <strong>{request.display_name}</strong> ·{' '}
                    {Math.max(
                      0,
                      Math.ceil((Date.parse(request.expires_at) - tick - serverOffset) / 1000),
                    )}{' '}
                    seconds left
                  </p>
                ))}
              {due.every((request) => Date.parse(request.expires_at) <= tick + serverOffset) && (
                <p>No photo checks are due right now.</p>
              )}
            </Card>
          </aside>
        </div>
      )}
    </main>
  );
}

export default function AttendanceStationPage() {
  usePageMeta(
    'Shared attendance device',
    'Supervised employee attendance for an HR-authorized guard.',
    true,
  );
  const { session, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!session) return <Navigate to="/login?station=1" replace />;
  if (session.role !== 'employee')
    return (
      <main className="security-attendance" id="main-content">
        <Brand />
        <ErrorState
          title="Guard Employee account required"
          description="Sign in with an HR-authorized guard’s Employee account. HR manages guard authorization in Attendance security."
        />
        <Button to="/login?station=1">Sign in as a guard</Button>
        <Button to={session.workspace} variant="secondary">
          Back to dashboard
        </Button>
      </main>
    );
  return <SharedStation key={session.user_id + ':' + session.organization_id} />;
}
