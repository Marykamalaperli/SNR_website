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
  const { state, search } = useLocation();
  const attendanceEntry = new URLSearchParams(search).get('attendance') === '1';
  const stationEntry = new URLSearchParams(search).get('station') === '1';
  const attendanceReturn = stationEntry
    ? '/attendance/station'
    : attendanceEntry || state?.from === '/attendance'
      ? '/attendance'
      : null;
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const next = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    setMessage('');
    if (Object.keys(next).length) {
      event.currentTarget.querySelector(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const confirmed = await signIn(email, password);
      navigate(
        confirmed.role === 'employee' && attendanceReturn ? attendanceReturn : confirmed.workspace,
        { replace: true },
      );
    } catch (error) {
      setMessage(error.message || 'Sign-in is unavailable. Please try again later.');
    } finally {
      setSubmitting(false);
    }
  }

  if (session && !attendanceEntry && !stationEntry)
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
              ? 'Use your own Employee account, then verify your passkey, store location and fresh photo.'
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
