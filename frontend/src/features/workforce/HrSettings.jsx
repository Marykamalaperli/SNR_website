import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import useRemoteData from '../../hooks/useRemoteData';
import { loadWorkspaceSettings, saveWorkspaceSettings } from '../../services/workforceService';
import { updateOwnLogin } from '../../services/adminAccountService';
import PageHeader from '../../components/dashboard/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormField from '../../components/forms/FormField';
import { ErrorState, LoadingState } from '../../components/common/States';
import RecordForm from './RecordForm';
import PasswordField from './PasswordField';

export default function HrSettings() {
  const { session, refreshSession } = useAuth();
  const { data: loaded, loading, error, reload } = useRemoteData(loadWorkspaceSettings);
  const [confirmed, setConfirmed] = useState(null);
  const data = confirmed || loaded;
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState('');
  async function saved(message) {
    setEditor(null);
    setNotice(message);
    await refreshSession();
  }
  return (
    <>
      <PageHeader
        eyebrow="MAKE IT YOUR WORKSPACE"
        title="Settings"
        description="Manage your organization and your own account here."
      />
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <LoadingState label="Loading workspace settings…" />
      ) : error ? (
        <Card>
          <ErrorState description={error} onRetry={reload} />
        </Card>
      ) : (
        <Card>
          <div className="card-heading">
            <div>
              <h2>Workspace preferences</h2>
              <p>Organization details and your display name.</p>
            </div>
            <Button onClick={() => setEditor('workspace')}>Edit workspace</Button>
          </div>
          <dl className="detail-grid profile-details">
            {[
              ['Organization', data.name],
              ['Default time zone', data.timezone],
              ['Your display name', data.display_name || session.display_name],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
      <Card>
        <div className="card-heading">
          <div>
            <h2>Your login details</h2>
            <p>{session.email}</p>
          </div>
          <Button variant="secondary" onClick={() => setEditor('login')}>
            Change my login details
          </Button>
        </div>
        <p className="settings-hint">
          Staff sign-in emails, passwords and account access are managed from Employees → Manage
          account.
        </p>
      </Card>
      {editor === 'workspace' && data && (
        <RecordForm
          title="Edit workspace"
          onClose={() => setEditor(null)}
          onSave={async (values) => {
            setConfirmed(await saveWorkspaceSettings(values, data.version));
            await saved('Workspace settings saved.');
          }}
        >
          <FormField
            label="Organization name"
            name="name"
            required
            maxLength={160}
            defaultValue={data.name}
          />
          <FormField
            label="Default time zone"
            name="timezone"
            required
            maxLength={80}
            defaultValue={data.timezone}
            hint="Used for new sites. Existing sites and shift templates keep their saved time zones."
          />
          <FormField
            label="Your display name"
            name="display_name"
            required
            maxLength={120}
            defaultValue={data.display_name || session.display_name}
          />
        </RecordForm>
      )}
      {editor === 'login' && (
        <RecordForm
          title="Change my login details"
          onClose={() => setEditor(null)}
          onSave={async (values) => {
            const result = await updateOwnLogin(values);
            await saved(
              result.emailPending
                ? 'Check your inbox to confirm the email change. Your current email remains active until confirmation.'
                : 'Your login details were updated.',
            );
          }}
        >
          <FormField
            label="Your sign-in email"
            type="email"
            name="email"
            required
            maxLength={254}
            defaultValue={session.email}
          />
          <PasswordField
            label="New password"
            required={false}
            hint="Leave blank to keep your current password. Use 12–64 characters to set a new one."
          />
        </RecordForm>
      )}
    </>
  );
}
