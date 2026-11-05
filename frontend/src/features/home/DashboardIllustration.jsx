import Bloom from '../../components/common/Bloom';
import { ArrowUpRight, CalendarDays, Check, Clock3, Sun, Users } from 'lucide-react';

export default function DashboardIllustration() {
  return (
    <figure className="hero-illustration" aria-label="Illustration of a calm, organized workday">
      <div className="illustration-orbit" />
      <span className="spark spark-one" aria-hidden="true">
        <Bloom />
      </span>
      <span className="spark spark-two" aria-hidden="true">
        +
      </span>
      <div className="illustration-window" aria-hidden="true">
        <div className="window-top">
          <span className="mini-logo">N</span>
          <strong>Your workday, in one place.</strong>
          <span className="window-dots">•••</span>
        </div>
        <div className="window-content">
          <div className="illustration-greeting">
            <span>LET’S MAKE TODAY A GOOD ONE</span>
            <h3>
              Hello, Alex <Sun size={23} />
            </h3>
            <p>A clear view of what’s next.</p>
          </div>
          <div className="illustration-week">
            {['M', 'T', 'W', 'T', 'F'].map((day, i) => (
              <span className={i === 2 ? 'selected' : ''} key={i}>
                {day}
                <i>{i < 2 ? <Check size={12} /> : '·'}</i>
              </span>
            ))}
          </div>
          <div className="illustration-shift">
            <div className="illustration-icon">
              <Clock3 size={20} />
            </div>
            <div>
              <small>TODAY’S SHIFT</small>
              <strong>Ready for the day</strong>
              <span>Everything you need, right here.</span>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <div className="illustration-bottom">
            <div>
              <Users size={18} />
              <span>Your people</span>
            </div>
            <div className="mini-avatars">
              <b>AL</b>
              <b>MK</b>
              <b>JS</b>
            </div>
          </div>
        </div>
      </div>
      <div className="floating-note note-top" aria-hidden="true">
        <span className="note-check">
          <Check size={18} />
        </span>
        <div>
          <strong>All set for today.</strong>
          <small>A smoother start.</small>
        </div>
      </div>
      <div className="floating-note note-bottom" aria-hidden="true">
        <CalendarDays size={22} />
        <span>
          Less juggling.
          <br />
          <strong>More getting things done.</strong>
        </span>
      </div>
      <figcaption>AN ILLUSTRATIVE LOOK AT YOUR WORKSPACE</figcaption>
    </figure>
  );
}
