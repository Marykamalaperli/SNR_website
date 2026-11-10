import { useRef, useState } from 'react';
import FormField from '../../components/forms/FormField';
import { saveEmployee } from '../../services/workforceService';
import { createStaffAccount, recoverStaffAccount } from '../../services/adminAccountService';
import RecordForm from './RecordForm';
import SelectField from './SelectField';
import PasswordField from './PasswordField';

export default function EmployeeForm({ record, organization, onClose, onSaved }) {
  const [mode, setMode] = useState('create');
  const [pending, setPending] = useState(null);
  const requestId = useRef(crypto.randomUUID());
  const nameField = (
    <FormField
      label="Full name"
      name="display_name"
      required
      pattern=".*\S.*"
      maxLength={120}
      defaultValue={record?.display_name || ''}
      autoComplete="off"
      hint="Required. This name identifies the employee and is used for attendance photo filenames."
    />
  );
  async function submit(values) {
    try {
      if (record) await saveEmployee(values, record);
      else {
        const result = pending
          ? await recoverStaffAccount(pending)
          : await createStaffAccount(values, requestId.current, mode);
        if (result.status === 'failed') {
          setPending(null);
          requestId.current = crypto.randomUUID();
          throw new Error('No account setup was confirmed. Review the details and try again.');
        }
      }
      onSaved(record ? 'Employee changes saved.' : 'Employee account and profile saved.');
    } catch (error) {
      if (error.operationClosed) {
        setPending(null);
        requestId.current = crypto.randomUUID();
      } else if (error.operationId) setPending(error.operationId);
      throw error;
    }
  }
  return (
    <RecordForm
      title={record ? 'Edit employee' : 'Add employee'}
      onClose={onClose}
      submitLabel={
        pending
          ? 'Check account setup'
          : record
            ? 'Save changes'
            : mode === 'create'
              ? 'Create employee'
              : 'Link employee'
      }
      lockFields={Boolean(pending)}
      onSave={submit}
    >
      {!record && nameField}
      {!record && (
        <FormField label="Account setup">
          {(attributes) => (
            <select {...attributes} value={mode} onChange={(event) => setMode(event.target.value)}>
              <option value="create">Create new account</option>
              <option value="existing">Link existing account</option>
            </select>
          )}
        </FormField>
      )}
      <FormField
        label="Account email"
        type="email"
        name="email"
        required
        maxLength={254}
        readOnly={Boolean(record)}
        autoComplete="off"
        defaultValue={record?.email || ''}
        hint={
          record
            ? 'Use Manage account in the directory to change the sign-in email or password.'
            : mode === 'create'
              ? 'The person will use this email to sign in.'
              : 'Use the email of the existing account. Its sign-in details stay unchanged.'
        }
      />
      {!record && (
        <PasswordField
          required={mode === 'create'}
          label={mode === 'create' ? 'Initial password' : 'New password'}
          hint={
            mode === 'create'
              ? 'Use 12–64 characters. Share this password securely with the person.'
              : 'Leave blank to keep the existing password, or set a new one here.'
          }
        />
      )}
      {pending && (
        <p className="notice">
          This account setup needs a status check. You can also find it under Pending account
          requests in the directory.
        </p>
      )}
      <div className={record ? 'form-grid' : undefined}>
        {record && nameField}
        <FormField
          label="Employee number"
          name="employee_number"
          required
          maxLength={40}
          defaultValue={record?.employee_number || ''}
          autoComplete="off"
        />
      </div>
      <div className="form-grid">
        <SelectField
          label="Site"
          name="site_id"
          required
          placeholder="Choose a site"
          defaultValue={record?.site_id || ''}
          options={organization.sites.filter((site) => site.active)}
        />
        <SelectField
          label="Department"
          name="department_id"
          required
          placeholder="Choose a department"
          defaultValue={record?.department_id || ''}
          options={organization.departments}
        />
      </div>
      <SelectField
        label="Workspace role"
        name="role"
        defaultValue={record?.role || 'employee'}
        options={[
          { id: 'employee', name: 'Employee' },
          { id: 'supervisor', name: 'Supervisor' },
        ]}
        hint="A supervisor can view people in the department and site selected above. HR, auditor and owner access is managed separately."
      />
      <SelectField
        label="Account access"
        name="active"
        defaultValue={String(record?.active ?? true)}
        options={[
          { id: 'true', name: 'Active' },
          { id: 'false', name: 'Inactive' },
        ]}
        hint="Inactive disables this organization’s workspace access and keeps the employee profile. Existing sessions lose data access on their next request."
      />
    </RecordForm>
  );
}
