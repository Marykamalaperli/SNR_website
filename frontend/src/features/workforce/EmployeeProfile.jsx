import { useAuth } from '../../hooks/useAuth';
import useRemoteData from '../../hooks/useRemoteData';
import { loadDirectory } from '../../services/workforceService';
import PageHeader from '../../components/dashboard/PageHeader';
import Card from '../../components/common/Card';
import StatusBadge from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';

export default function EmployeeProfile() {
  const { session } = useAuth();
  const { data, loading, error, reload } = useRemoteData(loadDirectory);
  const profile = data?.rows.find((person) => person.is_self);
  return (
    <>
      <PageHeader
        eyebrow="MY WORKSPACE"
        title="My profile"
        description="Your account and workplace details."
      />
      <Card className="profile-card">
        <div className="card-heading">
          <h2>Employee details</h2>
          <StatusBadge tone="positive">Signed in</StatusBadge>
        </div>
        {loading ? (
          <LoadingState label="Loading your profile…" />
        ) : error ? (
          <ErrorState description={error} onRetry={reload} />
        ) : !profile ? (
          <EmptyState
            title="Your employee profile is being prepared"
            description="Your account is signed in. Ask HR to link your profile to a department and site."
          />
        ) : (
          <dl className="detail-grid profile-details">
            {[
              ['Name', profile.display_name],
              ['Employee number', profile.employee_number],
              ['Email', session.email],
              ['Organization', session.organization_name],
              ['Department', profile.department_name],
              ['Site', profile.site_name],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || 'Not assigned'}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>
    </>
  );
}
