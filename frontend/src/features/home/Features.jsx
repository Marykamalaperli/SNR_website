import { Clock3, UsersRound, ContactRound, Files } from 'lucide-react';

const features = [
  {
    icon: Clock3,
    title: 'Attendance Tracking',
    text: 'Start your day, record your time, and keep your attendance in order.',
    tone: 'orange',
  },
  {
    icon: UsersRound,
    title: 'Team Management',
    text: 'Know who’s in, keep schedules clear, and help your team stay connected.',
    tone: 'gold',
  },
  {
    icon: ContactRound,
    title: 'Employee Records',
    text: 'Keep essential employee information organized and easy to find.',
    tone: 'coral',
  },
  {
    icon: Files,
    title: 'Reports & Documents',
    text: 'Find the records and documents you need, without the back-and-forth.',
    tone: 'teal',
  },
];

export default function Features() {
  return (
    <section id="features" className="features-section container" aria-labelledby="features-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">LESS ADMIN. MORE MOMENTUM.</p>
          <h2 id="features-title">
            The essentials. <span>All together.</span>
          </h2>
        </div>
        <p>
          A simpler way to look after the details,
          <br className="desktop-only" /> so you can focus on your people.
        </p>
      </div>
      <div className="feature-grid">
        {features.map(({ icon: Icon, title, text, tone }, index) => (
          <article key={title} className={`feature-card feature-${tone}`}>
            <div className="feature-top">
              <span className={`feature-icon tone-${tone}`}>
                <Icon size={24} />
              </span>
              <span className="feature-number">0{index + 1}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
