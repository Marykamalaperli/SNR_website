import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Check, Layers3, UsersRound, UserCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import useRemoteData from '../../hooks/useRemoteData';
import { loadOrganization } from '../../services/workforceService';
import PageHeader from '../../components/dashboard/PageHeader';
import SummaryStrip from '../../components/dashboard/SummaryStrip';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { ErrorState, LoadingState } from '../../components/common/States';
import AttendanceEntryCard from '../attendance/AttendanceEntryCard';

export default function HrDashboard() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useRemoteData(loadOrganization);
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE WORKSPACE"
        title={`Welcome, ${session.display_name}.`}
        description={`A home for your people at ${session.organization_name || 'your organization'}.`}
        action={
          <Button to="/hr/employees">
            Open directory
            <ArrowRight size={17} aria-hidden="true" />
          </Button>
        }
      />
      <AttendanceEntryCard />
      {loading ? (
        <LoadingState label="Loading your workspace…" />
      ) : error ? (
        <Card>
          <ErrorState
            title="Workforce records are not ready"
            description={error}
            onRetry={reload}
          />
        </Card>
      ) : (
        <>
          <SummaryStrip
            items={[
              {
                label: 'Employee profiles',
                value: data.counts.employees,
                description: 'Saved in your organization',
                icon: UsersRound,
              },
              {
                label: 'Active staff accounts',
                value: data.counts.active_employees,
                description: 'Profile and access enabled',
                icon: UserCheck,
                tone: 'teal',
              },
              {
                label: 'Work sites',
                value: data.sites.length,
                description: `${data.departments.length} ${data.departments.length === 1 ? 'department' : 'departments'} configured`,
                icon: Building2,
                tone: 'gold',
              },
            ]}
          />
          <div className="workforce-home-grid">
            <Card>
              <div className="card-heading">
                <div>
                  <h2>A good start for every person</h2>
                  <p>Set up your workplace, then bring your team in.</p>
                </div>
              </div>
              <ol className="workforce-checklist">
                {[
                  {
                    title: 'Add your work sites',
                    description: 'Give each location its name and time zone.',
                    done: data.sites.length > 0,
                    to: '/hr/sites',
                  },
                  {
                    title: 'Organize departments',
                    description: 'Connect people to the team they work with.',
                    done: data.departments.length > 0,
                    to: '/hr/sites',
                  },
                  {
                    title: 'Add your first employee',
                    description: 'Create their login and profile right here.',
                    done: data.counts.employees > 0,
                    to: '/hr/employees',
                  },
                  {
                    title: 'Define shift templates',
                    description: 'Save local hours for each work site.',
                    done: data.shifts.length > 0,
                    to: '/hr/sites',
                  },
                ].map((step, index) => (
                  <li key={step.title}>
                    <span className={`checklist-marker ${step.done ? 'is-complete' : ''}`}>
                      <span className="sr-only">{step.done ? 'Complete' : 'To do'}</span>
                      {step.done ? <Check size={18} aria-hidden="true" /> : index + 1}
                    </span>
                    <div>
                      <h3>{step.title}</h3>
                      <p>{step.description}</p>
                    </div>
                    <Link
                      to={step.to}
                      className="text-link"
                      aria-label={`${step.done ? 'Review' : 'Start'}: ${step.title}`}
                    >
                      <ArrowRight size={19} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </Card>
            <Card className="workforce-guide">
              <span className="feature-icon tone-orange">
                <Layers3 aria-hidden="true" />
              </span>
              <h2>A clear place for your team</h2>
              <p>
                Manage employee profiles, work sites and departments. Supervisors see people in
                their assigned department and site; employees see their own profile.
              </p>
              <Link to="/hr/employees" className="text-link">
                Find your people
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <div className="workforce-next">
                <h3>A workday, recorded</h3>
                <p>
                  Assign employee shifts in the directory, then review their recorded clock-ins and
                  clock-outs. Correction reviews are the next workflow.
                </p>
                <Link to="/hr/attendance" className="text-link">
                  Review attendance
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
