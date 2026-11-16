import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import QRCode from 'qrcode';
import { QrCode, Search, ShieldCheck, MapPin, Camera } from 'lucide-react';
import Brand from '../components/common/Brand';
import Button from '../components/common/Button';
import FormField from '../components/forms/FormField';
import { LoadingState } from '../components/common/States';
import { useAuth } from '../hooks/useAuth';
import { loadEmployeeQr } from '../services/attendanceService';
import usePageMeta from '../hooks/usePageMeta';
import '../styles/security-attendance.css';

export default function AttendanceQrPage({
  embedded = false,
  searchOnly = false,
  onSelect = null,
}) {
  usePageMeta('Employee attendance QR', 'Find an individual employee attendance QR.', true);
  const { session, loading } = useAuth();
  const { hash } = useLocation();
  const target = new URLSearchParams(hash.slice(1)).get('employee-card');
  const [card, setCard] = useState(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [rotating, setRotating] = useState(false);
  useEffect(() => {
    if (!session || (!target && (searchOnly || session.role !== 'employee'))) return;
    let active = true;
    loadEmployeeQr(target).then(
      (value) => {
        if (active) setCard(value);
      },
      (failure) => {
        if (active) setError(failure.message);
      },
    );
    return () => {
      active = false;
    };
  }, [session, target, searchOnly]);
  const link = card
    ? new URL('/login?attendance=1#employee-qr=' + card.token, window.location.origin).href
    : '';
  useEffect(() => {
    if (!link) return;
    let active = true;
    QRCode.toDataURL(link, { width: 640, margin: 4, errorCorrectionLevel: 'M' }).then(
      (value) => {
        if (active) setImage(value);
      },
      () => {
        if (active) setError('The QR image could not be generated. Try again.');
      },
    );
    return () => {
      active = false;
    };
  }, [link]);
  async function find(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setCard(null);
    setImage('');
    setRotating(false);
    try {
      setCard(await loadEmployeeQr(null, false, null, code.trim()));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  async function regenerate() {
    setBusy(true);
    setError('');
    setImage('');
    try {
      setCard(await loadEmployeeQr(card.employee_id, true, card.version));
      setRotating(false);
    } catch (failure) {
      setError(failure.message);
      try {
        const latest = await loadEmployeeQr(card.employee_id);
        setCard(latest);
        const latestLink = new URL(
          '/login?attendance=1#employee-qr=' + latest.token,
          window.location.origin,
        ).href;
        setImage(
          await QRCode.toDataURL(latestLink, { width: 640, margin: 4, errorCorrectionLevel: 'M' }),
        );
      } catch {
        setCard(null);
      }
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <LoadingState />;
  if (!session && !embedded) return <Navigate to={'/login?card=1' + hash} replace />;
  const Container = embedded ? 'section' : 'main';
  return (
    <Container className="attendance-qr-display" id={embedded ? undefined : 'main-content'}>
      {!embedded && <Brand />}
      <span className="eyebrow">
        <QrCode size={19} /> INDIVIDUAL EMPLOYEE ATTENDANCE
      </span>
      <h1>{searchOnly ? 'Security · Find employee QR' : 'Employee attendance QR'}</h1>
      <p>
        Enter the employee’s permanent attendance ID, confirm their name and designation, then scan
        their QR.
      </p>
      {!session ? (
        <p>
          Employee QR search is available after a verified sign-in. Preview screens do not access
          private profiles.
        </p>
      ) : (
        <>
          <form onSubmit={find} className="employee-qr-search">
            <FormField
              label="Employee attendance ID"
              name="attendance_id"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              maxLength={32}
              placeholder="SNR-000000000001"
              required
              autoComplete="off"
            />
            <Button type="submit" disabled={busy}>
              <Search size={18} />
              {busy ? 'Searching…' : 'Find employee QR'}
            </Button>
          </form>
          <p className="field-hint">
            Employees can open their own card. HR and authorized staff can search within their
            permitted workplace.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {card && (
        <section className="employee-qr-card" aria-label="Employee QR card">
          <span className="eyebrow">{card.attendance_id}</span>
          <h2>{card.display_name}</h2>
          <p className="employee-qr-designation">
            {card.designation || 'Designation not set — ask HR to update the profile'}
          </p>
          <p>{card.site_name}</p>
          {image ? (
            <img
              src={image}
              width="320"
              height="320"
              alt={'Attendance QR for ' + card.display_name}
            />
          ) : (
            <LoadingState label="Preparing QR…" />
          )}
          <div className="security-requirements">
            <span>
              <ShieldCheck size={18} />
              Own credentials
            </span>
            <span>
              <MapPin size={18} />
              Within 50 metres
            </span>
            <span>
              <Camera size={18} />
              Employee & guard photos
            </span>
          </div>
          <div className="security-header-actions">
            {embedded && (
              <Button
                href={'/attendance/qr#employee-card=' + card.employee_id}
                target="_blank"
                rel="noopener noreferrer"
                variant="secondary"
              >
                Open display window
              </Button>
            )}
            <Button href={link}>Open employee attendance</Button>
            {onSelect && (
              <Button onClick={() => onSelect(card)}>
                Use this employee QR on the shared device
              </Button>
            )}
            {image && (
              <Button
                href={image}
                download={card.attendance_id + '-attendance-qr.png'}
                variant="secondary"
              >
                Download QR
              </Button>
            )}
            {card.can_regenerate && (
              <Button variant="text" onClick={() => setRotating(true)} disabled={busy}>
                Regenerate lost QR
              </Button>
            )}
          </div>
          {rotating && (
            <div className="notice" role="alert">
              <p>
                Replace {card.display_name}’s QR? The previous QR and unfinished attendance screens
                stop working immediately. Saved attendance and photos are kept.
              </p>
              <Button onClick={regenerate} disabled={busy}>
                Confirm regenerate QR
              </Button>
              <Button variant="text" onClick={() => setRotating(false)} disabled={busy}>
                Keep current QR
              </Button>
            </div>
          )}
        </section>
      )}
      <p className="muted">
        A QR contains no password and grants no attendance authority. Only its matching employee can
        sign in for this card.
      </p>
      <div className="station-qr-help">
        <h2>Using a guard’s phone?</h2>
        <p>
          The guard opens a supervised turn for the individual QR. The employee enters their own
          credentials. Both live photos and the guard’s passkey approval are required.
        </p>
        <Button
          to={'/attendance/station' + (card ? '#employee-qr=' + card.token : '')}
          variant="secondary"
        >
          Open shared attendance device
        </Button>
      </div>
    </Container>
  );
}
