import { useState } from 'react';
import { Eye, EyeOff, ArrowRight, LockKeyhole } from 'lucide-react';
import { Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Button from '../components/common/Button';
import FormField from '../components/forms/FormField';
import { useAuth } from '../hooks/useAuth';
import { authConfigured } from '../lib/config';
import usePageMeta from '../hooks/usePageMeta';

export default function LoginPage() {
  usePageMeta('Sign In', 'Sign in to your SNR NEST workspace.', true);
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const { state, search, hash } = useLocation();
  const attendanceEntry = new URLSearchParams(search).get('attendance') === '1';
  const stationEntry = new URLSearchParams(search).get('station') === '1';
  const qrToken = new URLSearchParams(hash.slice(1)).get('employee-qr');
  const cardEntry = new URLSearchParams(search).get('card') === '1';
  const cardId = new URLSearchParams(hash.slice(1)).get('employee-card');
  const qrHash = qrToken && /^[0-9a-f-]{36}$/i.test(qrToken) ? '#employee-qr=' + qrToken : '';
  const cardReturn = cardEntry
    ? '/attendance/qr' +
      (cardId && /^[0-9a-f-]{36}$/i.test(cardId) ? '#employee-card=' + cardId : '')
    : null;
  const attendanceReturn = stationEntry
    ? '/attendance/station' + qrHash
    : attendanceEntry || state?.from === '/attendance'
      ? qrHash
        ? '/attendance/employee' + qrHash
        : '/attendance'
      : null;
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const emailVal = email.trim();
    const passwordVal = password;
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) next.email = 'Enter a valid email address.';
    if (!passwordVal) next.password = 'Enter your password.';
    setErrors(next);
    setMessage('');
    if (Object.keys(next).length) {
      event.currentTarget.querySelector(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const confirmed = await signIn(emailVal, passwordVal);
      navigate(
        cardReturn ||
          (confirmed.role === 'employee' && attendanceReturn
            ? attendanceReturn
            : confirmed.workspace),
        { replace: true },
      );
    } catch (error) {
      setMessage(error.message || 'Sign-in is unavailable. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  }

  if (session && !attendanceEntry && !stationEntry && !cardEntry)
    return (
      <Navigate
        to={session.role === 'employee' && attendanceReturn ? attendanceReturn : session.workspace}
        replace
      />
    );
  return (
    <>
      <div className="login-heading">
        <p className="eyebrow">
          {attendanceReturn ? 'SECURITY ATTENDANCE' : 'WELCOME TO SNR NEST'}
        </p>
        <h2>
          {stationEntry
            ? 'Guard sign-in'
            : attendanceReturn
              ? 'Sign in for attendance'
              : 'Good to see you.'}
        </h2>
        <p className="muted">
          {stationEntry
            ? 'Use your HR-authorized guard account to open a shared attendance device.'
            : attendanceReturn
              ? 'Use your own Employee account, then verify your store location and take separate employee and guard photos with guard approval.'
              : 'Sign in and settle into your workday.'}
        </p>
      </div>
      {!authConfigured && (
        <p className="notice">
          <LockKeyhole size={18} aria-hidden="true" />
          <span>
            Sign-in isn’t available yet. Your administrator will let you know when your workspace is
            ready.
          </span>
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="login-form">
        <FormField
          label="Email address"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          required
        />
        <FormField label="Password" error={errors.password}>
          {(props) => (
            <div className="password-field">
              <input
                {...props}
                name="password"
                type={visible ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="icon-button"
                aria-label={visible ? 'Hide password' : 'Show password'}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          )}
        </FormField>
        {message && (
          <p className="form-error" role="alert">
            {message}
          </p>
        )}
        <Button type="submit" disabled={submitting} className="full-width">
          {submitting ? 'Signing in…' : 'Sign In'}
          <ArrowRight size={18} />
        </Button>
      </form>
      <p className="login-help">Need access? Contact your HR administrator.</p>
      {import.meta.env.DEV && (
        <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.85rem' }}>
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#334155' }}>Demo / Dev Quick-Fill Accounts:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={() => {
                setEmail('super_admin@dev.example.org');
                setPassword('test-seed-password-123!');
              }}
            >
              Super Admin
            </button>
            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={() => {
                setEmail('store_admin@dev.example.org');
                setPassword('test-seed-password-123!');
              }}
            >
              Store Admin
            </button>
            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={() => {
                setEmail('employee@dev.example.org');
                setPassword('test-seed-password-123!');
              }}
            >
              Employee
            </button>
            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={() => {
                setEmail('hr_payroll@dev.example.org');
                setPassword('test-seed-password-123!');
              }}
            >
              HR / Payroll
            </button>
          </div>
        </div>
      )}
      {import.meta.env.DEV && (
        <aside className="preview-links" aria-label="Development previews">
          <span className="eyebrow">DESIGN PREVIEW · SAMPLE DATA ONLY</span>
          <p>Take a look around. No account needed.</p>
          <div>
            <Link to="/preview/me">
              Employee <ArrowRight size={15} />
            </Link>
            <Link to="/preview/team">
              Supervisor <ArrowRight size={15} />
            </Link>
            <Link to="/preview/hr">
              HR <ArrowRight size={15} />
            </Link>
          </div>
        </aside>
      )}
    </>
  );
}
