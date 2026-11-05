import { CircleAlert, FolderOpen, LoaderCircle } from 'lucide-react';
import Button from './Button';

export function EmptyState({
  title = 'Nothing here yet',
  description = 'Updates will appear here when they’re available.',
  action,
}) {
  return (
    <div className="empty-state">
      <FolderOpen aria-hidden="true" />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="empty-state" role="status">
      <LoaderCircle className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
  href,
}) {
  return (
    <div className="empty-state" role="alert">
      <CircleAlert aria-hidden="true" />
      <h2>{title}</h2>
      <p>{description}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
      {href && <Button to={href}>Open my workspace</Button>}
    </div>
  );
}
