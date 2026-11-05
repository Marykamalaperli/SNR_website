import { NavLink, Link } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Leaf } from 'lucide-react';
import Brand from '../common/Brand';
import { workspaces } from '../../app/navigation';
import { useWorkspace } from '../../hooks/useWorkspace';

export default function Sidebar({ onNavigate }) {
  const { role, base, isPreview, user } = useWorkspace();
  const workspace = workspaces[role];
  return (
    <div className="sidebar-content">
      <Brand light />
      <div className="sidebar-workspace">
        <span className="eyebrow">{workspace.label}</span>
        <h2>{workspace.name}</h2>
      </div>
      <nav aria-label={`${workspace.name} navigation`} className="sidebar-nav">
        {workspace.links.map(([path, label, Icon]) => (
          <NavLink key={path} to={path ? `${base}/${path}` : base} end={!path} onClick={onNavigate}>
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <Leaf size={22} aria-hidden="true" />
          <p>
            A little structure.
            <br />
            <strong>A smoother workday.</strong>
          </p>
        </div>
        {isPreview && (
          <Link to="/login" className="sidebar-back">
            <ArrowLeft size={16} /> All sample workspaces <ArrowUpRight size={15} />
          </Link>
        )}
        <div className="sidebar-person">
          <span className="avatar avatar-orange">{user.initials}</span>
          <div>
            <strong>{user.name}</strong>
            <small>{workspace.name}</small>
          </div>
        </div>
      </div>
    </div>
  );
}
