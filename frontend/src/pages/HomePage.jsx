import Bloom from '../components/common/Bloom';
import { ArrowRight, ArrowUpRight, Check } from 'lucide-react';
import Button from '../components/common/Button';
import DashboardIllustration from '../features/home/DashboardIllustration';
import Features from '../features/home/Features';
import usePageMeta from '../hooks/usePageMeta';

const steps = [
  ['Sign in to your workspace', 'One familiar place for employees, supervisors, and HR.'],
  [
    'Manage your daily activities',
    'Record attendance, check schedules, and take care of what’s next.',
  ],
  ['Review records and updates', 'Stay on top of requests and keep everyone moving forward.'],
];

export default function HomePage() {
  usePageMeta(
    'Workforce Management, Made Simple.',
    'Manage attendance, employee information, team schedules, and daily workforce operations in one organized workspace.',
  );
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">
              <span /> GOOD DAYS START WITH CLARITY
            </p>
            <h1>
              Workforce <br />
              Management, <br />
              <span>Made Simple.</span>
            </h1>
            <p className="hero-description">
              Manage attendance, employee information, team schedules, and daily workforce
              operations in one organized workspace.
            </p>
            <div className="hero-actions">
              <Button to="/login">
                Sign In <ArrowUpRight size={19} />
              </Button>
              <Button href="#features" variant="secondary">
                Explore Features <ArrowRight size={18} />
              </Button>
            </div>
            <div className="hero-footnote">
              <span>
                <Check size={15} /> Your people.
              </span>
              <span>
                <Check size={15} /> Your workday.
              </span>
              <span>
                <Check size={15} /> One workspace.
              </span>
            </div>
          </div>
          <DashboardIllustration />
        </div>
        <div className="container hero-divider">
          <span>MADE FOR THE WAY YOU WORK</span>
          <p>
            For employees. For team leaders. <strong>For everyone behind a great workday.</strong>
          </p>
        </div>
      </section>
      <Features />
      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="container">
          <div className="how-heading">
            <div>
              <p className="eyebrow">A LITTLE STRUCTURE GOES A LONG WAY</p>
              <h2 id="how-title">
                A better workday.
                <br />
                <span>In three simple steps.</span>
              </h2>
            </div>
            <span className="how-flower" aria-hidden="true">
              <Bloom />
            </span>
          </div>
          <div className="steps-grid">
            {steps.map(([title, text], index) => (
              <article className="step" key={title}>
                <span className="step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="container final-cta">
        <div>
          <p className="eyebrow">A PLACE FOR YOUR PEOPLE</p>
          <h2>Make room for a smoother day.</h2>
        </div>
        <Button to="/login">
          Go to Sign In <ArrowUpRight size={19} />
        </Button>
      </section>
    </>
  );
}
