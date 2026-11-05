import { useId } from 'react';

export default function FormField({ label, error, hint, id: providedId, children, ...props }) {
  const generated = useId();
  const id = providedId || generated;
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children ? (
        children({
          id,
          'aria-invalid': Boolean(error),
          'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
        })
      ) : (
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          {...props}
        />
      )}
      {hint && (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
