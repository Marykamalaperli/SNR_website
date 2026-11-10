import { useCallback, useState } from 'react';
import Modal from '../../components/common/Modal';
import FormField from '../../components/forms/FormField';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import {
  loadStoreArea,
  saveAttendanceSite,
  resolveStoreMapLink,
} from '../../services/workforceService';
import RecordForm from './RecordForm';
import StoreLocationFields from './StoreLocationFields';

function SiteForm({ record, area, organization, onClose, onSaved }) {
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  return (
    <RecordForm
      title={record ? 'Edit site' : 'Add site'}
      onClose={onClose}
      submitLabel={record ? 'Save changes' : 'Add site'}
      lockFields={locating}
      blockSubmit={locating || resolving}
      onSave={async (values) => {
        await saveAttendanceSite(values, record, area);
        onSaved('Site saved.');
      }}
    >
      <FormField
        label="Site name"
        name="name"
        required
        maxLength={120}
        defaultValue={record?.name || ''}
        autoComplete="off"
      />
      <FormField
        label="Time zone"
        name="timezone"
        required
        maxLength={80}
        defaultValue={record?.timezone || organization.organization.timezone}
        hint="Use an IANA time zone, such as Asia/Kolkata. Shifts retain their saved time zone."
      />
      <StoreLocationFields
        area={area}
        onLocating={setLocating}
        onResolving={setResolving}
        resolveLink={resolveStoreMapLink}
      />
    </RecordForm>
  );
}
export default function AttendanceSiteEditor(props) {
  const loader = useCallback(
    () => (props.record ? loadStoreArea(props.record.id) : Promise.resolve({ version: null })),
    [props.record],
  );
  const { data, loading, error, reload } = useRemoteData(loader);
  if (loading || error)
    return (
      <Modal title={props.record ? 'Edit site' : 'Add site'} onClose={props.onClose}>
        {loading ? (
          <LoadingState label="Loading site location…" />
        ) : (
          <ErrorState
            title="Site location could not be loaded"
            description={error}
            onRetry={reload}
          />
        )}
      </Modal>
    );
  return <SiteForm {...props} area={data} />;
}
