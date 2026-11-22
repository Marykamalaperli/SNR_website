import { ComponentProps, ReactNode } from 'react';

export interface ButtonProps extends ComponentProps<'button'> {
  to?: string;
  href?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | string;
  className?: string;
  children?: ReactNode;
}

export default function Button(props: ButtonProps): JSX.Element;
