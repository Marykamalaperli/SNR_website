import { ComponentProps, ReactNode } from 'react';

export interface FormFieldProps extends ComponentProps<'input'> {
  label: string;
  error?: string;
  hint?: string;
  id?: string;
  children?: (props: Record<string, unknown>) => ReactNode;
}

export default function FormField(props: FormFieldProps): JSX.Element;
