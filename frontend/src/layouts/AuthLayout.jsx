import Bloom from '../components/common/Bloom';
import { ArrowLeft, Quote } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import Brand from '../components/common/Brand';

export default function AuthLayout() {
  return (
    <main className="auth-layout" id="main-content">
      <aside className="auth-story">
        <Brand light />
        <div className="auth-story-copy">
          <span className="auth-art" aria-hidden="true">
            <Bloom />
          </span>
          <p className="eyebrow">YOUR PEOPLE. YOUR WORKDAY.</p>
          <h1>
            A little clarity.
            <br />A lot of possibility.
          </h1>
          <p>
            Good work starts with a little less juggling. Bring your day together, one task at a
            time.
          </p>
          <div className="auth-note">
            <Quote size={24} aria-hidden="true" />
            <span>
              A space for the people
              <br />
              who make things happen.
            </span>
          </div>
        </div>
        <small>Built around your people.</small>
      </aside>
      <div className="auth-main">
        <Link to="/" className="back-link">
          <ArrowLeft size={16} /> Back to home
        </Link>
        <div className="auth-form-wrap">
          <Outlet />
        </div>
        <p className="auth-copyright">© {new Date().getFullYear()} SNR NEST</p>
      </div>
    </main>
  );
}
