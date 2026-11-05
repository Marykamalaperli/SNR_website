const tones = {
  Present: 'positive',
  Approved: 'positive',
  Recommended: 'positive',
  'Clocked in': 'positive',
  'Clocked out': 'neutral',
  Completed: 'positive',
  Active: 'positive',
  Pending: 'pending',
  'Awaiting review': 'pending',
  'Not started': 'neutral',
  'Missed punch': 'critical',
  Absent: 'critical',
  Rejected: 'critical',
  Flagged: 'critical',
};

export default function StatusBadge({ children, tone }) {
  return (
    <span className={`status status-${tone || tones[children] || 'neutral'}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
