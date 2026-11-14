import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, ShieldCheck, MapPin, Camera } from 'lucide-react';
import Brand from '../components/common/Brand';
import Button from '../components/common/Button';
import usePageMeta from '../hooks/usePageMeta';
import '../styles/security-attendance.css';

export default function AttendanceQrPage({ embedded = false }) {
  usePageMeta('Attendance QR', 'Scan to sign in for employee attendance.', true);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const link = new URL('/login?attendance=1', window.location.origin).href;
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(link, { width: 640, margin: 4, errorCorrectionLevel: 'M' }).then(
      (src) => {
        if (active) setImage(src);
      },
      () => {
        if (active) setError('The attendance QR could not be generated. Reload this window.');
      },
    );
    return () => {
      active = false;
    };
  }, [link]);
  const Container = embedded ? 'section' : 'main';
  return (
    <Container className="attendance-qr-display" id={embedded ? undefined : 'main-content'}>
      {!embedded && <Brand />}
      <span className="eyebrow">
        <QrCode size={19} />
        EMPLOYEE ATTENDANCE
      </span>
      <h1>{embedded ? 'Attendance QR' : 'Scan. Sign in. Record your attendance.'}</h1>
      <p>One common QR for every employee. Your credentials identify your individual account.</p>
      {image && <img src={image} width="320" height="320" alt="Common employee attendance QR" />}
      {error && <p role="alert">{error}</p>}
      <div className="security-requirements">
        <span>
          <ShieldCheck size={18} />
          Your sign-in
        </span>
        <span>
          <MapPin size={18} />
          50-metre area
        </span>
        <span>
          <Camera size={18} />
          Live selfie
        </span>
      </div>
      <div className="security-header-actions">
        {embedded && (
          <Button
            href="/attendance/qr"
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
          >
            Open display window
          </Button>
        )}
        <Button href={link}>Open attendance</Button>
        {image && (
          <Button href={image} download="snr-common-attendance-qr.png" variant="secondary">
            Download QR
          </Button>
        )}
      </div>
      <p className="muted">
        This QR contains no employee credentials and cannot record attendance by itself.
      </p>
      <div className="station-qr-help">
        <h2>No phone? Ask the guard.</h2>
        <p>
          Use the supervised shared device. Enter your own credentials, take your photo, and have
          the guard check your staff ID.
        </p>
        <Button to="/attendance/station" variant="secondary">
          Open shared attendance device
        </Button>
      </div>
    </Container>
  );
}
