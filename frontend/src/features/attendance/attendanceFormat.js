export function dateLabel(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`));
}
export function momentLabel(value, timezone) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}
export function durationLabel(seconds) {
  if (seconds === null || seconds === undefined) return 'In progress';
  const minutes = Math.floor(Math.max(0, Number(seconds)) / 60);
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function earlierDate(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
