import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import FormField from '../../components/forms/FormField';

export default function PasswordField({
  label = 'Initial password',
  required = true,
  hint = 'Use 12–64 characters. Share this password securely with the person.',
}) {
  const [visible, setVisible] = useState(false);
  return (
    <FormField label={label} hint={hint}>
      {(attributes) => (
        <div className="account-password">
          <input
            {...attributes}
            name="password"
            type={visible ? 'text' : 'password'}
            required={required}
            minLength={12}
            maxLength={64}
            autoComplete="new-password"
          />
          <button
            type="button"
            className="icon-button"
            aria-label={visible ? 'Hide password' : 'Show password'}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </FormField>
  );
}
