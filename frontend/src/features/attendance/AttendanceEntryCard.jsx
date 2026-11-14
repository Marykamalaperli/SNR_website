import { QrCode, ExternalLink, UsersRound } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import '../../styles/security-attendance.css';

export default function AttendanceEntryCard() {
  return (
    <Card className="attendance-entry-card">
      <span className="feature-icon tone-orange">
        <QrCode aria-hidden="true" />
      </span>
      <div>
        <span className="eyebrow">EMPLOYEE ATTENDANCE</span>
        <h2>One QR. A simple start.</h2>
        <p>Display the QR at your entrance. Employees scan it and sign in to their own account.</p>
        <div className="security-header-actions">
          <Button href="/attendance/qr" target="_blank" rel="noopener noreferrer">
            <QrCode size={19} /> Open attendance QR <ExternalLink size={16} />
          </Button>
          <Button to="/attendance/station" variant="secondary">
            <UsersRound size={19} /> Help an employee without a phone
          </Button>
        </div>
        <p className="field-hint">
          Shared-device attendance requires an HR-authorized guard and the employee’s own sign-in.
        </p>
      </div>
    </Card>
  );
}
