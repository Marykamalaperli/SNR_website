import { useCallback } from 'react';
import { ExternalLink, MapPin } from 'lucide-react';
import Modal from '../../components/common/Modal';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadAttendanceLocations } from '../../services/attendanceService';
import { dateLabel, momentLabel } from './attendanceFormat';

function SavedPoint({ point, label, timezone, emptyText = 'Location not collected.' }) {
  if (!point)
    return (
      <section className="saved-attendance-location">
        <h3>{label}</h3>
        <p className="muted">{emptyText}</p>
      </section>
    );
  const latitude = point.latitude;
  const longitude = point.longitude;
  const accuracy = point.accuracy_meters;
  if (
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(accuracy) ||
    accuracy < 0
  )
    return (
      <section className="saved-attendance-location">
        <h3>{label}</h3>
        <p className="form-error">This saved location could not be displayed.</p>
      </section>
    );
  const map = new URL('https://www.openstreetmap.org/');
  map.searchParams.set('mlat', String(latitude));
  map.searchParams.set('mlon', String(longitude));
  map.hash = `map=18/${latitude}/${longitude}`;
  return (
    <section className="saved-attendance-location">
      <h3>
        <MapPin size={18} aria-hidden="true" />
        {label}
      </h3>
      <dl>
        <div>
          <dt>Coordinates</dt>
          <dd>
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </dd>
        </div>
        <div>
          <dt>Reported accuracy</dt>
          <dd>±{Math.ceil(accuracy).toLocaleString('en-IN')} m</dd>
        </div>
        <div>
          <dt>Device capture time</dt>
          <dd>{momentLabel(point.captured_at, timezone)}</dd>
        </div>
        <div>
          <dt>Attendance saved</dt>
          <dd>{momentLabel(point.recorded_at, timezone)}</dd>
        </div>
        <div>
          <dt>Store area check</dt>
          <dd>
            {point.store_rule_version === 'store-radius-v1' &&
            Number.isFinite(point.store_distance_meters) &&
            Number.isFinite(point.store_radius_meters)
              ? `${Math.round(point.store_distance_meters)} m from store centre · ${point.store_radius_meters} m allowed · policy ${point.store_policy_version}`
              : 'Recorded before store area checks.'}
          </dd>
        </div>
      </dl>
      <a className="text-link" href={map.href} target="_blank" rel="noopener noreferrer">
        View {label.toLowerCase()} on map
        <ExternalLink size={15} aria-hidden="true" />
      </a>
    </section>
  );
}

export default function AttendanceLocationDetails({ row, onClose }) {
  const loader = useCallback(() => loadAttendanceLocations(row.id), [row.id]);
  const { data, error, loading, reload } = useRemoteData(loader);
  return (
    <Modal title="Attendance locations" onClose={onClose}>
      <p className="muted">
        {row.display_name} · {dateLabel(row.attendance_date)}
      </p>
      <p className="field-hint">
        Saved device-reported positions. A map opens in a new tab when you choose its link.
      </p>
      {loading ? (
        <LoadingState label="Loading saved locations…" />
      ) : error ? (
        <ErrorState title="Locations could not be loaded" description={error} onRetry={reload} />
      ) : (
        <>
          <SavedPoint label="Clock-in" point={data.clock_in} timezone={data.timezone} />
          <SavedPoint
            label="Clock-out"
            point={data.clock_out}
            timezone={data.timezone}
            emptyText={row.clock_out ? 'Location not collected.' : 'Clock-out not recorded yet.'}
          />
        </>
      )}
    </Modal>
  );
}
