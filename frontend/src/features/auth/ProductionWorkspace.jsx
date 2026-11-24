import { useAuth } from '../../hooks/useAuth';
import { WorkspaceContext } from '../../hooks/useWorkspace';
import { workspaces } from '../../app/navigation';
import DashboardLayout from '../../layouts/DashboardLayout';
import LiveWorkforce from '../workforce/LiveWorkforce';

export default function ProductionWorkspace({ role }) {
  const { session } = useAuth();
  const isSuperAdmin = Boolean(
    session?.actual_role === 'system_admin' ||
    session?.role === 'system_admin' ||
    session?.role === 'admin' ||
    session?.scopes?.some((s) => s.role === 'system_admin'),
  );
  const activeRole = isSuperAdmin ? 'admin' : role;
  const workspaceConfig = workspaces[activeRole] || workspaces[role];
  const displayName = isSuperAdmin
    ? session?.display_name && session.display_name !== 'HR Executive'
      ? session.display_name
      : 'Super Admin'
    : session?.display_name || 'Your workspace';
  const initials = isSuperAdmin
    ? 'SA'
    : (displayName || 'SNR NEST')
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
  return (
    <WorkspaceContext.Provider
      value={{
        role: activeRole,
        isSuperAdmin,
        isPreview: false,
        base: `/${workspaceConfig.slug}`,
        user: {
          name: displayName,
          initials,
        },
        data: null,
      }}
    >
      <DashboardLayout>
        <LiveWorkforce
          key={`${session.user_id}:${session.organization_id}:${activeRole}`}
          role={activeRole}
          base={`/${workspaceConfig.slug}`}
        />
      </DashboardLayout>
    </WorkspaceContext.Provider>
  );
}
