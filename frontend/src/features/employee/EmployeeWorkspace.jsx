import { useState } from 'react';
import { ArrowRight, CalendarDays, MapPin, Plus, Clock3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import PageHeader from '../../components/dashboard/PageHeader';
import AttendanceAction from '../attendance/AttendanceAction';
import AttendanceTable from '../attendance/AttendanceTable';
import CorrectionForm from '../corrections/CorrectionForm';
import CorrectionList from '../corrections/CorrectionList';
import DocumentsPanel from '../documents/DocumentsPanel';
import { useWorkspace } from '../../hooks/useWorkspace';

export default function EmployeeWorkspace({ section }) {
  const { data, base, user, dateLabel } = useWorkspace();
  const [requestOpen, setRequestOpen] = useState(false);
  const pending = data.corrections.filter((item) => item.status === 'Pending').length;
  const requestButton = (
    <Button variant="secondary" onClick={() => setRequestOpen(true)}>
      <Plus size={17} />
      Request Correction
    </Button>
  );
  let content;
  if (section === 'documents')
    content = (
      <>
        <PageHeader
          eyebrow="YOUR ESSENTIALS"
          title="My documents"
          description="Helpful guides, all in one place."
        />
        <DocumentsPanel />
      </>
    );
  else if (section === 'profile')
    content = (
      <>
        <PageHeader
          eyebrow="YOUR DETAILS"
          title="My profile"
          description="Something changed? Your HR team can help update your details."
        />
        <Card className="profile-card">
          <span className="avatar avatar-large avatar-orange">AM</span>
          <h2>{user.name}</h2>
          <p className="muted">Operations · SNR-001</p>
          <dl className="detail-grid">
            <div>
              <dt>Email</dt>
              <dd>alex@example.invalid</dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd>Hyderabad</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>Operations</dd>
            </div>
            <div>
              <dt>Shift</dt>
              <dd>General · 09:00–18:00</dd>
            </div>
          </dl>
          <p className="notice">These are synthetic profile details for the design preview.</p>
        </Card>
      </>
    );
  else if (section === 'schedule')
    content = (
      <>
        <PageHeader
          eyebrow="PLAN YOUR DAY"
          title="My schedule"
          description="A clear view of the week ahead."
        />
        <Card>
          <div className="card-heading">
            <h2>General shift</h2>
            <span className="date-label">Sample week · 2–6 Nov</span>
          </div>
          <div className="schedule-grid">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((day, index) => (
              <div className={index === 3 ? 'schedule-day selected' : 'schedule-day'} key={day}>
                <span>{day}</span>
                <strong>{index + 2} Nov</strong>
                <Clock3 size={18} />
                <span>09:00–18:00</span>
                <small>Hyderabad</small>
              </div>
            ))}
          </div>
          <p className="card-footnote">
            All sample shift times are in Asia/Kolkata. Check with your supervisor for schedule
            changes.
          </p>
        </Card>
      </>
    );
  else if (section === 'corrections')
    content = (
      <>
        <PageHeader
          eyebrow="KEEP YOUR RECORDS RIGHT"
          title="Correction requests"
          description="Track your requests and their review status."
          action={requestButton}
        />
        <Card>
          <div className="card-heading">
            <h2>Your requests</h2>
            <span className="count-label">{pending} pending</span>
          </div>
          <CorrectionList />
        </Card>
      </>
    );
  else if (section === 'attendance')
    content = (
      <>
        <PageHeader
          eyebrow="YOUR WORKDAY"
          title="My attendance"
          description="Your time, clearly recorded."
          action={requestButton}
        />
        <AttendanceAction />
        <Card>
          <div className="card-heading">
            <h2>Attendance history</h2>
          </div>
          <AttendanceTable records={data.attendance} />
        </Card>
      </>
    );
  else
    content = (
      <>
        <PageHeader
          eyebrow={dateLabel.toUpperCase()}
          title={`A fresh start, ${user.name.split(' ')[0]}.`}
          description="Here’s what your workday looks like."
          action={
            <span className="date-chip">
              <CalendarDays size={17} />
              Thursday, 5 Nov
            </span>
          }
        />
        <div className="employee-overview">
          <AttendanceAction />
          <Card className="shift-card">
            <span className="eyebrow">YOUR SCHEDULE</span>
            <div className="shift-icon">
              <CalendarDays size={25} />
            </div>
            <h2>General shift</h2>
            <p className="shift-hours">
              09:00 <span>—</span> 18:00
            </p>
            <p className="muted">
              <MapPin size={15} />
              Hyderabad · Main office
            </p>
            <div className="shift-meta">
              <StatusBadge tone="positive">Assigned</StatusBadge>
              <span>Asia/Kolkata</span>
            </div>
            <Link className="text-link" to={`${base}/schedule`}>
              View my schedule <ArrowRight size={16} />
            </Link>
          </Card>
        </div>
        <Card>
          <div className="card-heading">
            <div>
              <h2>Recent attendance</h2>
              <p>A quick look at your last few workdays.</p>
            </div>
            <Link className="text-link" to={`${base}/attendance`}>
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <AttendanceTable records={data.attendance.slice(0, 3)} />
        </Card>
        <div className="employee-lower">
          <Card className="pending-card">
            <span className="feature-icon tone-gold">
              <Clock3 />
            </span>
            <div>
              <h2>
                {pending} request{pending === 1 ? '' : 's'} awaiting review
              </h2>
              <p className="muted">We’ll keep your correction status right here.</p>
              <Link className="text-link" to={`${base}/corrections`}>
                View my requests <ArrowRight size={15} />
              </Link>
            </div>
          </Card>
          <Card className="help-card">
            <div>
              <p className="eyebrow">MISSED A PUNCH?</p>
              <h2>Let’s set the record straight.</h2>
              <p className="muted">A quick request is all it takes to start a review.</p>
            </div>
            {requestButton}
          </Card>
        </div>
      </>
    );
  return (
    <>
      {content}
      {requestOpen && <CorrectionForm onClose={() => setRequestOpen(false)} />}
    </>
  );
}
