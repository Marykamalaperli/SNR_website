import { useAuth } from '../../hooks/useAuth';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { workspaces } from '../../app/navigation';
import DashboardLayout from '../../layouts/DashboardLayout';
import LiveWorkforce from '../workforce/LiveWorkforce';

export default function ProductionWorkspace({ role }) {
  const { session } = useAuth();
  return (
    <WorkspaceContext.Provider
      value={{
        role,
        isPreview: false,
        base: `/${workspaces[role].slug}`,
        user: {
          name: session.display_name || 'Your workspace',
          initials: (session.display_name || 'SNR NEST')
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase(),
        },
        data: null,
      }}
    >
      <DashboardLayout>
        <LiveWorkforce
          key={`${session.user_id}:${session.organization_id}:${role}`}
          role={role}
          base={`/${workspaces[role].slug}`}
        />
      </DashboardLayout>
    </WorkspaceContext.Provider>
  );
}
