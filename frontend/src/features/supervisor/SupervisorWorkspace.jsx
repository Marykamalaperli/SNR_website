import { Link } from 'react-router-dom';
import { ArrowRight, UsersRound, UserCheck, CircleAlert, ClipboardCheck } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import PageHeader from '../../components/dashboard/PageHeader';
import SummaryStrip from '../../components/dashboard/SummaryStrip';
import PeopleTable from '../../components/dashboard/PeopleTable';
import CorrectionList from '../corrections/CorrectionList';

export default function SupervisorWorkspace({ section }) {
  const { data, base, user, dateLabel } = useWorkspace();
  const present = data.employees.filter((person) =>
    ['Present', 'Clocked out'].includes(person.status),
  ).length;
  const exceptions = data.employees.filter((person) =>
    ['Absent', 'Missed punch'].includes(person.status),
  );
  const pending = data.corrections.filter((item) => item.status === 'Pending').length;
  if (section === 'corrections')
    return (
      <>
        <PageHeader
          eyebrow="KEEP THINGS MOVING"
          title="Correction reviews"
          description="Review your team’s requests and send a recommendation to HR."
        />
        <Card>
          <div className="card-heading">
            <h2>Team requests</h2>
            <span className="count-label">{pending} pending</span>
          </div>
          <CorrectionList />
        </Card>
      </>
    );
  if (section === 'exceptions')
    return (
      <>
        <PageHeader
          eyebrow="A LITTLE ATTENTION NEEDED"
          title="Attendance exceptions"
          description="Check in with your team about missed punches or absences."
        />
        <Card>
          <div className="card-heading">
            <h2>Needs a follow-up</h2>
            <Button to={`${base}/corrections`} variant="secondary">
              Review requests <ArrowRight size={16} />
            </Button>
          </div>
          <PeopleTable people={exceptions} caption="Team attendance exceptions" />
        </Card>
      </>
    );
  if (section === 'members')
    return (
      <>
        <PageHeader
          eyebrow="YOUR PEOPLE"
          title="Team members"
          description="Your assigned Operations team, in one place."
        />
        <Card>
          <div className="card-heading">
            <h2>Operations team</h2>
            <span className="count-label">{data.employees.length} people</span>
          </div>
          <PeopleTable people={data.employees} directory caption="Assigned team members" />
        </Card>
      </>
    );
  if (section === 'attendance')
    return (
      <>
        <PageHeader
          eyebrow={dateLabel.toUpperCase()}
          title="Team attendance"
          description="A clear view of your assigned team’s day."
        />
        <Card>
          <div className="card-heading">
            <h2>Operations · Hyderabad</h2>
          </div>
          <PeopleTable people={data.employees} />
        </Card>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow={dateLabel.toUpperCase()}
        title={`Keep your team moving, ${user.name.split(' ')[0]}.`}
        description="A little clarity for the people counting on you."
        action={
          <Button to={`${base}/corrections`}>
            Review Requests <ArrowRight size={17} />
          </Button>
        }
      />
      <SummaryStrip
        items={[
          {
            label: 'Assigned team',
            value: data.employees.length,
            description: 'Operations',
            icon: UsersRound,
          },
          {
            label: 'Present today',
            value: present,
            description: `${data.employees.filter((p) => p.status === 'Absent').length} absent`,
            icon: UserCheck,
            tone: 'teal',
          },
          {
            label: 'Needs attention',
            value: exceptions.length,
            description: 'Attendance exceptions',
            icon: CircleAlert,
            tone: 'coral',
          },
        ]}
      />
      <div className="review-callout">
        <span className="feature-icon tone-gold">
          <ClipboardCheck />
        </span>
        <div>
          <h2>{pending} correction requests need a look.</h2>
          <p>Help your team keep their records right.</p>
        </div>
        <Link className="text-link" to={`${base}/corrections`}>
          Open review queue <ArrowRight size={16} />
        </Link>
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Team attendance</h2>
            <p>Operations · Hyderabad · General shift</p>
          </div>
          <Link className="text-link" to={`${base}/attendance`}>
            View all <ArrowRight size={15} />
          </Link>
        </div>
        <PeopleTable people={data.employees} />
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <h2>Pending correction reviews</h2>
            <p>Your recommendation helps HR make the final decision.</p>
          </div>
        </div>
        <CorrectionList compact />
      </Card>
    </>
  );
}
