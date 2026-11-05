import { useEffect, useRef, useState } from 'react';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import Brand from '../components/common/Brand';
import Button from '../components/common/Button';

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const location = useLocation();
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return (
    <>
      <header className="site-header">
        <div className="container header-inner">
          <Brand />
          <button
            ref={toggle}
            className="icon-button menu-toggle"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            aria-controls="public-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav
            id="public-navigation"
            aria-label="Main navigation"
            className={`public-nav ${open ? 'is-open' : ''}`}
            onClick={() => setOpen(false)}
          >
            <Link
              to="/"
              aria-current={location.pathname === '/' && !location.hash ? 'page' : undefined}
            >
              Home
            </Link>
            <a href="/#features">Features</a>
            <a href="/#how-it-works">How It Works</a>
            <Button to="/login">
              Sign In <ArrowUpRight size={17} />
            </Button>
          </nav>
        </div>
      </header>
      <main id="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <Brand light />
          <p>
            A little more clarity.
            <br />A better workday for everyone.
          </p>
          <nav aria-label="Footer navigation">
            <a href="/#features">Features</a>
            <a href="/#how-it-works">How It Works</a>
            <Link to="/login">Sign In</Link>
          </nav>
        </div>
        <div className="container footer-bottom">
          <span>© {new Date().getFullYear()} SNR NEST. All rights reserved.</span>
          <span>Built around your people.</span>
        </div>
      </footer>
    </>
  );
}
