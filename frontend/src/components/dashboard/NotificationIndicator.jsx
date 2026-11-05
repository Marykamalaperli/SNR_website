import { useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useWorkspace } from '../../hooks/useWorkspace';

export default function NotificationIndicator() {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const { data, base, role } = useWorkspace();
  const count = data?.corrections.filter((item) => item.status === 'Pending').length || 0;
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  return (
    <div className="notification-wrap">
      <button
        ref={trigger}
        className="icon-button"
        aria-label={`Notifications${count ? `, ${count} pending requests` : ''}`}
        aria-expanded={open}
        aria-controls="notifications"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {count > 0 && <span className="notification-dot" />}
      </button>
      {open && (
        <section
          className="notification-panel"
          id="notifications"
          aria-label="Notifications"
          onKeyDown={(event) => {
            if (event.key === 'Escape') close();
          }}
        >
          <div>
            <h2>Updates</h2>
            <button className="icon-button" aria-label="Close notifications" onClick={close}>
              <X size={17} />
            </button>
          </div>
          <p>
            {count
              ? `${count} sample correction request${count === 1 ? '' : 's'} awaiting review.`
              : 'You’re all caught up.'}
          </p>
          {count > 0 && (
            <Link
              to={`${base}/${role === 'hr' ? 'approvals' : 'corrections'}`}
              onClick={() => setOpen(false)}
            >
              View requests
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
