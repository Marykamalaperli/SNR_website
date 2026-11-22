import { ReactNode } from 'react';

export function EmptyState(props: {
  title?: string;
  description?: string;
  action?: ReactNode;
}): JSX.Element;

export function LoadingState(props: { label?: string }): JSX.Element;

export function ErrorState(props: {
  title?: string;
  description?: string;
  onRetry?: () => void | Promise<void>;
  href?: string;
}): JSX.Element;
