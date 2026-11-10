import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import Button from '../../components/common/Button';
import FormField from '../../components/forms/FormField';
import { captureDeviceLocation } from '../../services/locationService';

export default function StoreLocationFields({ area, onLocating }) {
  const [latitude, setLatitude] = useState(area?.latitude ?? '');
  const [longitude, setLongitude] = useState(area?.longitude ?? '');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
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
    onLocating(true);
    setError('');
    try {
      const point = await captureDeviceLocation();
      if (!active.current) return;
      setLatitude(point.latitude);
      setLongitude(point.longitude);
      setNotice(
        'Device accuracy: ±' +
          Math.ceil(point.accuracy_meters) +
          ' metres. Review the store centre before saving.',
      );
    } catch (failure) {
      if (active.current) setError(failure.message);
    } finally {
      busy.current = false;
      if (active.current) onLocating(false);
    }
  }
  return (
    <>
      <h3>Store attendance location</h3>
      <p className="field-hint">
        Enter the store centre, or use your current location while at the store. Both clock-in and
        clock-out must be inside this area.
      </p>
      <Button variant="secondary" onClick={locate}>
        <LocateFixed size={18} aria-hidden="true" />
        Use my current location
      </Button>
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
        defaultValue={area?.radius_meters ?? 100}
        hint="Choose 10–1,000 metres. Location accuracy must fit inside the boundary."
      />
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
    </>
  );
}
