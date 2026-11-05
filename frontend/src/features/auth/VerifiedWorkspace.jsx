import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useWorkspace } from '../../hooks/useWorkspace';
import { workspaces } from '../../app/navigation';
import Card from '../../components/common/Card';
import PageHeader from '../../components/dashboard/PageHeader';
import StatusBadge from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/States';

export default function VerifiedWorkspace() {
  const { session } = useAuth();
  const { role, base } = useWorkspace();
  const { pathname } = useLocation();
  const section = pathname.slice(base.length).replace(/^\/|\/$/g, '');
  const title = workspaces[role].links.find(([path]) => path === section)?.[1] || 'Workspace';
  return (
    <>
      <PageHeader
        eyebrow={workspaces[role].label}
        title={section ? title : `Welcome, ${session.display_name}.`}
        description={
          session.organization_name
            ? `You’re signed in to ${session.organization_name}.`
            : 'You’re signed in to your workspace.'
        }
      />
      {(!section || section === 'profile') && (
        <Card className="profile-card">
          <div className="card-heading">
            <h2>Account details</h2>
            <StatusBadge tone="positive">Signed in</StatusBadge>
          </div>
          <dl className="detail-grid">
            <div>
              <dt>Name</dt>
              <dd>{session.display_name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{session.email}</dd>
            </div>
            <div>
              <dt>Organization</dt>
              <dd>{session.organization_name || 'Your organization'}</dd>
            </div>
            <div>
              <dt>Workspace</dt>
              <dd>{workspaces[role].name}</dd>
            </div>
          </dl>
        </Card>
      )}
      {section !== 'profile' && (
        <Card>
          <EmptyState
            title="No workforce records available yet"
            description="Your administrator will let you know when records are ready for your workspace."
          />
        </Card>
      )}
    </>
  );
}
