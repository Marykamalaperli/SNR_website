import { useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import FormField from '../../components/forms/FormField';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadStoreArea, saveStoreArea } from '../../services/workforceService';
import { captureDeviceLocation } from '../../services/locationService';

function AreaForm({ area, onClose, onSaved }) {
  const [latitude, setLatitude] = useState(area.latitude ?? '');
  const [longitude, setLongitude] = useState(area.longitude ?? '');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  async function locate() {
    if (busy.current) return;
    busy.current = true;
    setLocating(true);
    setError('');
    setNotice('');
    try {
      const point = await captureDeviceLocation();
      if (!active.current) return;
      setLatitude(point.latitude);
      setLongitude(point.longitude);
      setNotice(
        `Device accuracy: ±${Math.ceil(point.accuracy_meters)} metres. Review the store centre before saving.`,
      );
    } catch (failure) {
      if (active.current) setError(failure.message);
    } finally {
      busy.current = false;
      if (active.current) setLocating(false);
    }
  }
  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await saveStoreArea(area, values);
      if (active.current)
        onSaved('Store attendance area saved. Both punches require a location inside this area.');
    } catch (failure) {
      if (active.current) setError(failure.message);
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }
  return (
    <Modal title={`Attendance area · ${area.site_name}`} onClose={onClose} busy={saving}>
      <form className="stack-form" onSubmit={submit}>
        <p className="muted">
          Set the centre of this store. Employees must be inside its allowed area for both clock-in
          and clock-out. Location accuracy must also fit inside the boundary.
        </p>
        <fieldset className="record-fields" disabled={saving || locating}>
          <Button variant="secondary" onClick={locate}>
            <LocateFixed size={18} aria-hidden="true" />
            {locating ? 'Getting location…' : 'Use my current location'}
          </Button>
          <p className="field-hint">
            Use this while at the store, or enter the store’s coordinates below. This button
            requests your device location to fill these fields; review them and save.
          </p>
          <div className="form-grid">
            <FormField
              label="Store latitude"
              name="latitude"
              type="number"
              min={-90}
              max={90}
              step="any"
              required
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
            />
            <FormField
              label="Store longitude"
              name="longitude"
              type="number"
              min={-180}
              max={180}
              step="any"
              required
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
            />
          </div>
          <FormField
            label="Allowed radius (metres)"
            name="radius_meters"
            type="number"
            min={10}
            max={1000}
            step={1}
            required
            defaultValue={area.radius_meters ?? 100}
            hint="100 metres is the default. Choose 10–1,000 metres to suit your store."
          />
        </fieldset>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || locating}>
            {saving ? 'Saving…' : 'Save attendance area'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function StoreAreaEditor({ site, onClose, onSaved }) {
  const loader = useCallback(() => loadStoreArea(site.id), [site.id]);
  const { data, loading, error, reload } = useRemoteData(loader);
  if (loading || error)
    return (
      <Modal title={`Attendance area · ${site.name}`} onClose={onClose}>
        {loading ? (
          <LoadingState label="Loading store area…" />
        ) : (
          <ErrorState title="Store area could not be loaded" description={error} onRetry={reload} />
        )}
      </Modal>
    );
  return <AreaForm area={data} onClose={onClose} onSaved={onSaved} />;
}
