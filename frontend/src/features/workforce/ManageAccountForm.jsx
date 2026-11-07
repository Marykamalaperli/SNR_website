import { useRef, useState } from 'react';
import FormField from '../../components/forms/FormField';
import { recoverStaffAccount, updateStaffAccount } from '../../services/adminAccountService';
import RecordForm from './RecordForm';
import PasswordField from './PasswordField';

export default function ManageAccountForm({ record, onClose, onSaved }) {
  const requestId = useRef(crypto.randomUUID());
  const snapshot = useRef(record);
  const [pending, setPending] = useState(null);
  async function submit(values) {
    try {
      if (!pending && values.email.trim() === record.email && !values.password)
        throw new Error('Change the email or enter a new password before saving.');
      const result = pending
        ? await recoverStaffAccount(pending)
        : await updateStaffAccount(snapshot.current, values, requestId.current);
      if (result.status === 'failed') {
        snapshot.current = {
          ...snapshot.current,
          version: result.profile_version || snapshot.current.version,
          membership_version: result.membership_version || snapshot.current.membership_version,
        };
        setPending(null);
        requestId.current = crypto.randomUUID();
        throw new Error('No account change was confirmed. Review the details and save again.');
      }
      onSaved('Account login details saved.');
    } catch (error) {
      if (error.operationClosed) {
        requestId.current = crypto.randomUUID();
        setPending(null);
        snapshot.current = {
          ...snapshot.current,
          version: error.profileVersion || snapshot.current.version,
          membership_version: error.membershipVersion || snapshot.current.membership_version,
        };
      } else if (error.operationId) setPending(error.operationId);
      throw error;
    }
  }
  return (
    <RecordForm
      title={`Manage account · ${record.display_name}`}
      onClose={onClose}
      onSave={submit}
      submitLabel={pending ? 'Check account request' : 'Save login details'}
      lockFields={Boolean(pending)}
    >
      <p className="field-hint">
        Update this person’s sign-in email or set a new password. Their employee profile and history
        stay linked to the same account.
      </p>
      <FormField
        label="Sign-in email"
        name="email"
        type="email"
        required
        maxLength={254}
        defaultValue={record.email}
        autoComplete="off"
      />
      <PasswordField
        label="New password"
        required={false}
        hint="Leave blank to keep the current password. Use 12–64 characters to set a new one."
      />
      {pending && (
        <p className="notice">
          This account request needs a status check. You can also find it under Pending account
          requests in the directory.
        </p>
      )}
    </RecordForm>
  );
}
