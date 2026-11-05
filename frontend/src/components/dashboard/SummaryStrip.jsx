export default function SummaryStrip({ items }) {
  return (
    <dl className="summary-strip">
      {items.map(({ label, value, description, tone = 'orange', icon: Icon }) => (
        <div key={label}>
          <span className={`summary-icon tone-${tone}`}>
            <Icon size={20} aria-hidden="true" />
          </span>
          <div>
            <dt>{label}</dt>
            <dd>
              {value}
              <small>{description}</small>
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
