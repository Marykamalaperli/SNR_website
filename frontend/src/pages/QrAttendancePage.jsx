import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, QrCode, MapPin, Camera, LogOut } from 'lucide-react';
import Brand from '../components/common/Brand';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import { ErrorState, LoadingState } from '../components/common/States';
import { useAuth } from '../hooks/useAuth';
import useRemoteData from '../hooks/useRemoteData';
import usePageMeta from '../hooks/usePageMeta';
import {
  loadSecurityWorkspace,
  releaseSecurityFlow,
  enrollAttendancePasskey,
} from '../services/securityAttendanceService';
import SecurityPresenceChecks from '../features/attendance/SecurityPresenceChecks';
import PunchCard from '../features/attendance/PunchCard';
import '../styles/security-attendance.css';

function EmployeeAttendance() {
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
  const [enrolling, setEnrolling] = useState(false),
    [enrollError, setEnrollError] = useState(''),
    [heartbeatError, setHeartbeatError] = useState('');
  const loader = useCallback(() => loadSecurityWorkspace(clientId), [clientId]);
  const state = useRemoteData(loader);
  const flowId = state.data?.security_flow_id;
  const approved = state.data?.security_credential_approved;
  useEffect(() => {
    if (!flowId) return;
    let active = true,
      running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const current = await loadSecurityWorkspace(clientId);
        if (active)
          setHeartbeatError(
            current.security_flow_id !== flowId
              ? 'Your attendance screen expired during inactivity. Refresh before continuing.'
              : current.security_credential_approved !== approved
                ? 'Your attendance security settings changed. Refresh to review them.'
                : '',
          );
      } catch (failure) {
        if (active) setHeartbeatError(failure.message);
      } finally {
        running = false;
      }
    }, 25000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [flowId, clientId, approved]);
  async function leave() {
    if (flowId) await releaseSecurityFlow(flowId).catch(() => {});
    await signOut();
  }
  async function enroll() {
    setEnrolling(true);
    setEnrollError('');
    try {
      await enrollAttendancePasskey(flowId);
      state.reload();
    } catch (failure) {
      setEnrollError(failure.message);
    } finally {
      setEnrolling(false);
    }
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
            <QrCode size={18} />
            Open attendance QR
          </Button>
          <Button variant="text" onClick={leave}>
            <LogOut size={18} />
            Sign out
          </Button>
        </div>
      </header>
      <section className="security-intro">
        <span className="eyebrow">
          <ShieldCheck size={17} />
          SECURITY ATTENDANCE
        </span>
        <h1>Your attendance. Your identity.</h1>
        <p>
          Signed in as <strong>{session.display_name}</strong> at {session.organization_name}. This
          screen records attendance only for your account.
        </p>
        <div className="security-requirements">
          <span>
            <ShieldCheck size={18} />
            Verified sign-in & passkey
          </span>
          <span>
            <MapPin size={18} />
            Within 50 metres
          </span>
          <span>
            <Camera size={18} />
            Fresh camera photo
          </span>
        </div>
      </section>
      <div className="security-content">
        <section aria-label="Your attendance action">
          {state.loading && <LoadingState label="Checking your attendance…" />}
          {state.error && (
            <Card>
              <ErrorState
                title="Attendance is unavailable"
                description={state.error}
                onRetry={state.reload}
              />
            </Card>
          )}
          {state.data && state.data.security_credential_approved && !heartbeatError && (
            <PunchCard
              workspace={state.data}
              securityFlowId={flowId}
              onRecorded={state.reload}
              onRefresh={state.reload}
            />
          )}
          {heartbeatError && (
            <Card>
              <ErrorState
                title="Attendance screen paused"
                description={heartbeatError}
                onRetry={state.reload}
              />
            </Card>
          )}
          {state.data && !state.data.security_credential_approved && (
            <Card className="live-punch-card">
              <h2>
                {state.data.security_credential_pending
                  ? 'Ask HR to approve your passkey'
                  : 'Secure your attendance identity'}
              </h2>
              <p>
                Use a passkey on your own device. Your fingerprint, Face ID or device PIN verifies
                each attendance confirmation; the application receives no biometric template.
              </p>
              <p>
                HR must verify you in person before approving the enrollment. Never share your
                passkey or device PIN.
              </p>
              {enrollError && (
                <p className="form-error" role="alert">
                  {enrollError}
                </p>
              )}
              {!state.data.security_credential_pending && (
                <Button onClick={enroll} disabled={enrolling}>
                  {enrolling ? 'Setting up…' : 'Enroll attendance passkey'}
                </Button>
              )}
              <Button variant="secondary" onClick={state.reload}>
                Check HR approval
              </Button>
            </Card>
          )}
          {state.data?.security_credential_approved && flowId && !heartbeatError && (
            <SecurityPresenceChecks flowId={flowId} workspace={state.data} />
          )}
        </section>
        <aside className="security-guide">
          <Card>
            <h2>Before you record attendance</h2>
            <ol>
              <li>
                Use your own account and approved passkey. Never share your password or device PIN.
              </li>
              <li>Allow a fresh, precise location at your assigned store.</li>
              <li>Take a new selfie after location is verified.</li>
              <li>Review and confirm your clock-in or clock-out.</li>
            </ol>
            <p>
              Attendance times come from the server. Another employee cannot be selected from this
              screen.
            </p>
            <Link to="/me/attendance" className="text-link">
              View my attendance history
            </Link>
            <p>
              Using a guard’s phone? Use the supervised shared device so the guard can verify you in
              person.
            </p>
            <Link to="/attendance/station" className="text-link">
              Open shared attendance device
            </Link>
          </Card>
        </aside>
      </div>
    </main>
  );
}

export default function QrAttendancePage() {
  usePageMeta('Security attendance', 'Sign in to record your own attendance securely.', true);
  const { session, loading } = useAuth();
  if (loading) return <LoadingState label="Checking your sign-in…" />;
  if (!session) return <Navigate to="/login" replace state={{ from: '/attendance' }} />;
  if (session.role !== 'employee')
    return (
      <main className="security-attendance" id="main-content">
        <Brand />
        <ErrorState
          title="Employee sign-in required"
          description="Use your personal Employee account to record attendance. A shared QR never grants attendance access to another account."
          href={session.workspace}
        />
        <Button href="/attendance/qr" target="_blank" rel="noopener noreferrer">
          Open attendance QR
        </Button>
      </main>
    );
  return <EmployeeAttendance key={`${session.user_id}:${session.organization_id}`} />;
}
