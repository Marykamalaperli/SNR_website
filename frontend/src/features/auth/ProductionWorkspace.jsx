import { useAuth } from '../../hooks/useAuth';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { workspaces } from '../../app/navigation';
import DashboardLayout from '../../layouts/DashboardLayout';

export default function ProductionWorkspace({ role }) {
  const { session } = useAuth();
  return (
    <WorkspaceContext.Provider
      value={{
        role,
        isPreview: false,
        base: `/${workspaces[role].slug}`,
        user: { name: session.display_name || 'Your workspace', initials: 'SN' },
        data: null,
      }}
    >
      <DashboardLayout />
    </WorkspaceContext.Provider>
  );
}
