import { useCallback, useState } from 'react';
import Modal from '../../components/common/Modal';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadStoreArea, saveStoreArea, resolveStoreMapLink } from '../../services/workforceService';
import RecordForm from './RecordForm';
import StoreLocationFields from './StoreLocationFields';

function AreaForm({ area, onClose, onSaved }) {
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  return (
    <RecordForm
      title={'Attendance area · ' + area.site_name}
      onClose={onClose}
      submitLabel="Save attendance area"
      lockFields={locating}
      blockSubmit={locating || resolving}
      onSave={async (values) => {
        await saveStoreArea(area, values);
        onSaved('Store attendance area saved. Both punches require a location inside this area.');
      }}
    >
      <StoreLocationFields
        area={area}
        onLocating={setLocating}
        onResolving={setResolving}
        resolveLink={resolveStoreMapLink}
      />
    </RecordForm>
  );
}
export default function StoreAreaEditor({ site, onClose, onSaved }) {
  const loader = useCallback(() => loadStoreArea(site.id), [site.id]);
  const { data, loading, error, reload } = useRemoteData(loader);
  if (loading || error)
    return (
      <Modal title={'Attendance area · ' + site.name} onClose={onClose}>
        {loading ? (
          <LoadingState label="Loading store area…" />
        ) : (
          <ErrorState title="Store area could not be loaded" description={error} onRetry={reload} />
        )}
      </Modal>
    );
  return <AreaForm area={data} onClose={onClose} onSaved={onSaved} />;
}
