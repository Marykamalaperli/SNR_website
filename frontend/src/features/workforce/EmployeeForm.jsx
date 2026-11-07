import FormField from '../../components/forms/FormField';
import { saveEmployee } from '../../services/workforceService';
import RecordForm from './RecordForm';
import SelectField from './SelectField';

export default function EmployeeForm({ record, organization, onClose, onSaved }) {
  return (
    <RecordForm
      title={record ? 'Edit employee' : 'Add employee'}
      onClose={onClose}
      submitLabel={record ? 'Save changes' : 'Add employee'}
      onSave={async (values) => {
        await saveEmployee(values, record);
        onSaved(
          record
            ? 'Employee changes saved.'
            : values.active === 'true'
              ? 'Employee added. Their assigned workspace is ready.'
              : 'Employee profile added with account access disabled.',
        );
      }}
    >
      {!record && (
        <p className="notice">
          First create a confirmed account in Supabase Authentication → Users. Enter that account’s
          email below to connect its employee profile.
        </p>
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
            ? 'Account credentials are managed in Supabase Authentication.'
            : 'Use the exact email of the confirmed account. A password is not needed here.'
        }
      />
      <div className="form-grid">
        <FormField
          label="Full name"
          name="display_name"
          required
          maxLength={120}
          defaultValue={record?.display_name || ''}
          autoComplete="off"
        />
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
