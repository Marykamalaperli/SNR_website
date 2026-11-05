import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  UsersRound,
  ClipboardCheck,
  UserCheck,
  Download,
  FileChartColumn,
  CalendarDays,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import PageHeader from '../../components/dashboard/PageHeader';
import SummaryStrip from '../../components/dashboard/SummaryStrip';
import PeopleTable from '../../components/dashboard/PeopleTable';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import CorrectionList from '../corrections/CorrectionList';
import DocumentsPanel from '../documents/DocumentsPanel';
import { downloadSampleReport } from '../../services/exportService';

export default function HrWorkspace({ section }) {
  const { data, base, user, dateLabel } = useWorkspace();
  const pending = data.corrections.filter((item) => item.status === 'Pending').length;
  const sites = [...new Set(data.employees.map((person) => person.site))];
  if (section === 'approvals')
    return (
      <>
        <PageHeader
          eyebrow="YOUR REVIEW QUEUE"
          title="Pending approvals"
          description="Give every correction a thoughtful final review."
        />
        <Card>
          <div className="card-heading">
            <h2>Correction requests</h2>
            <span className="count-label">{pending} pending</span>
          </div>
          <CorrectionList />
        </Card>
      </>
    );
  if (section === 'employees')
    return (
      <>
        <PageHeader
          eyebrow="PEOPLE, ORGANIZED"
          title="Employee directory"
          description="Find the right person, without the back-and-forth."
        />
        <Card>
          <div className="card-heading">
            <h2>Employee records</h2>
            <span className="count-label">{data.employees.length} people</span>
          </div>
          <PeopleTable people={data.employees} directory caption="Employee directory" />
        </Card>
      </>
    );
  if (section === 'attendance')
    return (
      <>
        <PageHeader
          eyebrow={dateLabel.toUpperCase()}
          title="Attendance overview"
          description="A clear view of attendance across your assigned sites."
        />
        <Card>
          <div className="card-heading">
            <h2>Attendance records</h2>
          </div>
          <PeopleTable people={data.employees} caption="Organization attendance" />
        </Card>
      </>
    );
  if (section === 'sites')
    return (
      <>
        <PageHeader
          eyebrow="PLACES & PLANS"
          title="Sites & shifts"
          description="Where your people work, and when their day begins."
        />
        <div className="document-grid">
          {sites.map((site) => (
            <Card className="site-card" key={site}>
              <span className="feature-icon tone-orange">
                <Building2 />
              </span>
              <h2>{site}</h2>
              <p className="muted">
                {data.employees.filter((p) => p.site === site).length} assigned sample employees
              </p>
              <div className="site-shift">
                <CalendarDays size={18} />
                <span>
                  General · 09:00–18:00
                  <br />
                  <small>Monday–Friday · Asia/Kolkata</small>
                </span>
              </div>
              {site === 'Bengaluru' && (
                <div className="site-shift">
                  <CalendarDays size={18} />
                  <span>
                    Late start · 10:00–19:00
                    <br />
                    <small>Engineering · Asia/Kolkata</small>
                  </span>
                </div>
              )}
              <StatusBadge tone="positive">Active</StatusBadge>
            </Card>
          ))}
        </div>
      </>
    );
  if (section === 'documents')
    return (
      <>
        <PageHeader
          eyebrow="THE RIGHT INFORMATION"
          title="Documents"
          description="Company guides for your people. Sample documents only."
        />
        <DocumentsPanel />
      </>
    );
  if (section === 'reports')
    return (
      <>
        <PageHeader
          eyebrow="A CLEARER PICTURE"
          title="Reports"
          description="Useful records, ready for a closer look."
        />
        <Card className="report-card">
          <span className="feature-icon tone-gold">
            <FileChartColumn />
          </span>
          <div>
            <h2>Sample attendance summary</h2>
            <p className="muted">
              A CSV of the synthetic roster shown in this preview. No private records are included.
            </p>
          </div>
          <Button onClick={() => downloadSampleReport(data.employees)}>
            <Download size={17} />
            Download Sample CSV
          </Button>
        </Card>
      </>
    );
  if (section === 'settings')
    return (
      <>
        <PageHeader
          eyebrow="WORKSPACE DETAILS"
          title="Settings"
          description="A simple view of your current workspace configuration."
        />
        <Card className="settings-card">
          <ShieldCheck size={30} />
          <h2>People operations</h2>
          <dl className="detail-grid">
            <div>
              <dt>Workspace</dt>
              <dd>SNR NEST · Design preview</dd>
            </div>
            <div>
              <dt>Time zone</dt>
              <dd>Asia/Kolkata</dd>
            </div>
            <div>
              <dt>Correction decisions</dt>
              <dd>Authorized HR staff</dd>
            </div>
            <div>
              <dt>Sites</dt>
              <dd>Hyderabad & Bengaluru</dd>
            </div>
          </dl>
          <p className="notice">
            Organization settings are read-only in this preview. Real configuration needs your
            organization’s approved policies.
          </p>
        </Card>
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow={dateLabel.toUpperCase()}
        title={`People first, ${user.name.split(' ')[0]}.`}
        description="The right details for a well-organized workday."
        action={
          <Button to={`${base}/approvals`}>
            Review Approvals <ArrowRight size={17} />
          </Button>
        }
      />
      <SummaryStrip
        items={[
          {
            label: 'Employee records',
            value: data.employees.length,
            description: 'Across assigned sites',
            icon: UsersRound,
          },
          {
            label: 'Pending approvals',
            value: pending,
            description: 'Corrections to review',
            icon: ClipboardCheck,
            tone: 'gold',
          },
          {
            label: 'Present today',
            value: data.employees.filter((p) => ['Present', 'Clocked out'].includes(p.status))
              .length,
            description: `Across ${sites.length} sites`,
            icon: UserCheck,
            tone: 'teal',
          },
        ]}
      />
      <Card>
        <div className="card-heading">
          <div>
            <h2>Employee directory</h2>
            <p>A quick way to find your people.</p>
          </div>
          <Link className="text-link" to={`${base}/employees`}>
            View directory <ArrowRight size={15} />
          </Link>
        </div>
        <PeopleTable people={data.employees} directory caption="Employee directory" />
      </Card>
      <div className="hr-bottom-grid">
        <Card>
          <div className="card-heading">
            <h2>Awaiting your approval</h2>
            <Link className="text-link" to={`${base}/approvals`}>
              View all <ArrowRight size={15} />
            </Link>
          </div>
          <div className="approval-summary">
            <span className="approval-number">{pending}</span>
            <div>
              <h3>Let’s keep requests moving.</h3>
              <p className="muted">Your team is waiting on a final review.</p>
            </div>
            <Button to={`${base}/approvals`} variant="secondary">
              Review Requests <ArrowRight size={16} />
            </Button>
          </div>
        </Card>
        <Card className="sites-summary">
          <div className="card-heading">
            <h2>Sites & shifts</h2>
            <Building2 size={20} />
          </div>
          {sites.map((site) => (
            <div className="site-row" key={site}>
              <span className="feature-icon tone-orange">
                <Building2 size={19} />
              </span>
              <div>
                <strong>{site}</strong>
                <small>
                  {data.employees.filter((p) => p.site === site).length} assigned people
                </small>
              </div>
            </div>
          ))}
          <Link className="text-link" to={`${base}/sites`}>
            View sites <ArrowRight size={15} />
          </Link>
        </Card>
      </div>
    </>
  );
}
