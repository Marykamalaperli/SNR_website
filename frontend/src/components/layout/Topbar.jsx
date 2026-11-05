import { LogOut, Menu } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useAuth } from '../../hooks/useAuth';
import { workspaces } from '../../app/navigation';
import NotificationIndicator from '../dashboard/NotificationIndicator';

export default function Topbar({ onOpenMenu }) {
  const { role, isPreview, user } = useWorkspace();
  const { signOut } = useAuth();
  return (
    <header className="dashboard-topbar">
      <div className="topbar-start">
        <button
          className="icon-button dashboard-menu"
          aria-label="Open workspace navigation"
          onClick={onOpenMenu}
        >
          <Menu />
        </button>
        <span className="topbar-breadcrumb">
          Workspace <span>/</span> <strong>{workspaces[role].name}</strong>
        </span>
      </div>
      <div className="topbar-end">
        <NotificationIndicator />
        <span className="topbar-divider" />
        <span className="avatar avatar-orange" title={user.name}>
          {user.initials}
        </span>
        {!isPreview && (
          <button className="icon-button" aria-label="Sign out" onClick={signOut}>
            <LogOut size={19} />
          </button>
        )}
      </div>
    </header>
  );
}
