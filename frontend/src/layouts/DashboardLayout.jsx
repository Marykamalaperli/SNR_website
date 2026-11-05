import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, FlaskConical } from 'lucide-react';
import { useWorkspace } from '../hooks/useWorkspace';
import usePageMeta from '../hooks/usePageMeta';
import Sidebar from '../components/layout/Sidebar';
import Topbar from '../components/layout/Topbar';
import Modal from '../components/common/Modal';
import { EmptyState } from '../components/common/States';
import { workspaces } from '../app/navigation';

export default function DashboardLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { role, base, isPreview, data } = useWorkspace();
  const section = pathname.slice(base.length).replace(/^\/|\/$/g, '');
  const nav = workspaces[role].links.find(([path]) => path === section);
  usePageMeta(
    `${nav?.[1] || 'Workspace'} · ${workspaces[role].name}`,
    'Your SNR NEST workspace.',
    true,
  );
  return (
    <div className="dashboard-layout">
      <aside className="desktop-sidebar">
        <Sidebar />
      </aside>
      {menuOpen && (
        <Modal title="Workspace navigation" onClose={() => setMenuOpen(false)}>
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </Modal>
      )}
      <div className="workspace-main">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        {isPreview && (
          <div className="preview-banner">
            <span>
              <FlaskConical size={16} aria-hidden="true" />
              <strong>Design preview</strong> · Synthetic data. Changes reset on refresh.
            </span>
            <Link to="/login">
              Explore workspaces <ArrowUpRight size={15} />
            </Link>
          </div>
        )}
        <main className="dashboard-content" id="main-content">
          {!nav ? (
            <EmptyState
              title="This page isn’t here"
              description="Choose a page from your workspace navigation."
            />
          ) : !isPreview ? (
            <EmptyState
              title="Your workspace is being prepared"
              description="Your account is verified. Workforce records will appear when your organization’s data connection is ready."
            />
          ) : (
            children
          )}
          <div className="workspace-feedback" role="status" aria-live="polite">
            {data?.notice}
          </div>
        </main>
        <footer className="workspace-footer">
          <span>SNR NEST</span>
          <span>A better workday, together.</span>
        </footer>
      </div>
    </div>
  );
}
