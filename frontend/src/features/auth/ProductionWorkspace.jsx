import { useAuth } from '../../hooks/useAuth';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { workspaces } from '../../app/navigation';
import DashboardLayout from '../../layouts/DashboardLayout';
import VerifiedWorkspace from './VerifiedWorkspace';

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
        <VerifiedWorkspace />
      </DashboardLayout>
    </WorkspaceContext.Provider>
  );
}
