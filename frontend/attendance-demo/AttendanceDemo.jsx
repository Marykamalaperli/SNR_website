import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Camera,
  Check,
  Clock3,
  Fingerprint,
  MapPin,
  RotateCcw,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import Button from '../src/components/common/Button';
import Modal from '../src/components/common/Modal';
import FormField from '../src/components/forms/FormField';
import AttendanceCapture from '../src/features/attendance/AttendanceCapture';
import StoreLocationFields from '../src/features/workforce/StoreLocationFields';
import { captureAttendanceLocation } from '../src/services/locationService';
import { checkDemoEvidence, INITIAL_SITE, SAMPLE_PHOTO, samplePoint } from './model';

const nav = [
  ['employee', 'Employee attendance', Clock3],
  ['site', 'Sites & Shifts', Building2],
  ['records', 'Recorded evidence', ShieldCheck],
];
const time = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(value));

function SampleCapture({ site, scenario, clockedIn, onClose, onConfirm }) {
  const [step, setStep] = useState('location');
  const [error, setError] = useState('');
  const point = samplePoint(site, scenario);
  function verifyLocation() {
    try {
      checkDemoEvidence(site, point);
      setError('');
      setStep('photo');
    } catch (failure) {
      setError(failure.message);
    }
  }
  function confirm() {
    try {
      onConfirm(point, SAMPLE_PHOTO, 'guided');
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <Modal title={(clockedIn ? 'Clock out' : 'Clock in') + ' · guided sample'} onClose={onClose}>
      <p className="demo-modal-note">Sample camera and location. No device permissions needed.</p>
      <ol className="attendance-capture-steps" aria-label="Sample attendance steps">
        <li>
          <MapPin size={18} />
          Verify location within 50 metres
        </li>
        <li>
          <Camera size={18} />
          Take photo
        </li>
      </ol>
      {step === 'location' && (
        <div className="demo-step">
          <h3>Check your store location</h3>
          <p>
            Sample position: {point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}
          </p>
          <p>Accuracy ±{point.accuracy_meters} m · Allowed radius 50 m</p>
          <Button onClick={verifyLocation}>
            <MapPin size={18} />
            Verify sample location
          </Button>
        </div>
      )}
      {step === 'photo' && (
        <div className="demo-step">
          <span className="demo-positive">
            <Check size={16} />
            Location matched
          </span>
          <img
            className="demo-sample-photo"
            src={SAMPLE_PHOTO}
            alt="Illustrative sample attendance photo"
          />
          <p>
            Review a fresh photo before continuing. Use camera mode on the main screen to try your
            own device.
          </p>
          <Button onClick={() => setStep('review')}>
            <Camera size={18} />
            Use sample photo
          </Button>
        </div>
      )}
      {step === 'review' && (
        <div className="demo-step">
          <h3>Ready to save your photo and location</h3>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStep('location')}>
              Retake sample photo
            </Button>
            <Button onClick={confirm}>Confirm sample {clockedIn ? 'clock-out' : 'clock-in'}</Button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

function SiteSetup({ site, onSaved }) {
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  function save(event) {
    event.preventDefault();
    if (locating) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const next = {
      ...site,
      name: values.name.trim(),
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      radius_meters: Number(values.radius_meters),
      map_url: values.map_url || '',
    };
    if (
      !next.name ||
      Math.abs(next.latitude) > 90 ||
      Math.abs(next.longitude) > 180 ||
      !Number.isInteger(next.radius_meters) ||
      next.radius_meters !== 50
    )
      return;
    onSaved(next);
    setNotice('Demo site saved. New punches use this store location and radius.');
  }
  return (
    <div className="demo-two-columns">
      <section className="demo-card">
        <div className="demo-card-heading">
          <span className="demo-feature-circle">
            <Building2 />
          </span>
          <div>
            <p className="demo-eyebrow">ADMIN VIEW · SAMPLE SITE</p>
            <h2>Set the attendance area</h2>
          </div>
        </div>
        <form className="stack-form" onSubmit={save}>
          <fieldset className="record-fields" disabled={locating}>
            <FormField
              label="Site name"
              name="name"
              defaultValue={site.name}
              required
              maxLength={120}
            />
            <p className="field-hint">
              Shift · 09:00–18:00, Asia/Kolkata. This is a sample schedule.
            </p>
            <StoreLocationFields area={site} onLocating={setLocating} />
          </fieldset>
          <Button type="submit" disabled={locating}>
            {locating ? 'Getting location…' : 'Save demo site'}
          </Button>
        </form>
        {notice && (
          <p className="success-notice" role="status">
            {notice}
          </p>
        )}
      </section>
      <section className="demo-card">
        <p className="demo-eyebrow">LOCATION BEFORE CAMERA</p>
        <h2>Within 50 metres of your store</h2>
        <p>
          Both clock-in and clock-out check your location before opening the camera and again when
          taking the photo.
        </p>
        <p className="field-hint">
          Set your current location as the store centre to try camera mode where you are. Review its
          accuracy before saving.
        </p>
      </section>
    </div>
  );
}

function Evidence({ records }) {
  if (!records.length)
    return (
      <section className="demo-card demo-empty">
        <ShieldCheck size={42} />
        <h2>Your first record starts here.</h2>
        <p>Complete a sample clock-in to review its photo, store match and location.</p>
      </section>
    );
  return (
    <div className="demo-evidence-list">
      {records.toReversed().map((record) => (
        <article className="demo-card demo-evidence" key={record.id}>
          <img
            src={record.photo}
            alt={record.kind === 'clock_in' ? 'Demo clock-in photo' : 'Demo clock-out photo'}
          />
          <div>
            <p className="demo-eyebrow">
              {record.mode === 'guided' ? 'GUIDED SAMPLE' : 'DEVICE CAPTURE · THIS TAB ONLY'}
            </p>
            <h2>
              {record.kind === 'clock_in' ? 'Clock-in' : 'Clock-out'} · {time(record.at)}
            </h2>
            <p>{record.site.name} · Sample employee</p>
            <dl className="demo-evidence-details">
              <div>
                <dt>Position</dt>
                <dd>
                  {record.point.latitude.toFixed(6)}, {record.point.longitude.toFixed(6)}
                </dd>
              </div>
              <div>
                <dt>Reported accuracy</dt>
                <dd>±{Math.ceil(record.point.accuracy_meters)} m</dd>
              </div>
              <div>
                <dt>Distance from store</dt>
                <dd>
                  {Math.round(record.distance)} m / {record.site.radius_meters} m allowed
                </dd>
              </div>
            </dl>
          </div>
        </article>
      ))}
    </div>
  );
}

export default function AttendanceDemo() {
  const [view, setView] = useState('employee');
  const [site, setSite] = useState(INITIAL_SITE);
  const [records, setRecords] = useState([]);
  const [mode, setMode] = useState('guided');
  const [scenario, setScenario] = useState('inside');
  const [consent, setConsent] = useState(false);
  const [capture, setCapture] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(true);
  const locked = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const clockedIn = records.at(-1)?.kind === 'clock_in';
  const checkLocation = useCallback(async () => {
    const point = await captureAttendanceLocation();
    checkDemoEvidence(site, point);
    return point;
  }, [site]);
  function saveRecord(point, photo, captureMode) {
    const distance = checkDemoEvidence(site, point);
    const kind = clockedIn ? 'clock_out' : 'clock_in';
    setRecords((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        kind,
        at: new Date().toISOString(),
        site: { ...site },
        point,
        distance,
        photo,
        mode: captureMode,
      },
    ]);
    setCapture(false);
    setConsent(false);
    setError('');
    setMessage(
      (clockedIn ? 'Clock-out' : 'Clock-in') +
        ' added to this demo tab. Your real SNR attendance is unchanged.',
    );
  }
  async function confirmDevice(evidence) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const point = evidence.photo.location_at_capture;
      if (!point) throw new Error('Enable location and retake your photo.');
      if (!active.current) return;
      saveRecord(point, 'data:image/jpeg;base64,' + evidence.photo.jpeg_base64, 'device');
    } catch (failure) {
      if (active.current) {
        setError(failure.message);
        setCapture(false);
      }
    } finally {
      locked.current = false;
      if (active.current) setBusy(false);
    }
  }
  function reset() {
    setSite(INITIAL_SITE);
    setRecords([]);
    setConsent(false);
    setError('');
    setMessage('Demo reset. Sample records were cleared from this tab.');
    setView('employee');
  }
  const headings = {
    employee: [
      'A better way to begin your day.',
      'Location first. Within 50 metres. A fresh photo.',
    ],
    site: [
      'Every store has its place.',
      'Review how admins set a store’s location and attendance radius.',
    ],
    records: [
      'The details behind every punch.',
      'Review photo and location evidence created in this demo tab.',
    ],
  };
  return (
    <div className="demo-app">
      <a className="skip-link" href="#demo-main">
        Skip to main content
      </a>
      <aside className="demo-sidebar">
        <a className="demo-brand" href="#">
          <span className="demo-brand-mark">
            <Fingerprint size={28} />
          </span>
          <span>
            SNR <strong>NEST</strong>
            <small>A better workday.</small>
          </span>
        </a>
        <span className="demo-review-label">ATTENDANCE REVIEW</span>
        <nav aria-label="Demo workspace">
          {nav.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => {
                setView(key);
                setError('');
                setMessage('');
              }}
              aria-current={view === key ? 'page' : undefined}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>
        <div className="demo-sidebar-bottom">
          <span className="demo-person">
            <UserRound />
            <strong>
              Sample employee<small>Review workspace</small>
            </strong>
          </span>
          <p>
            Sample data only.
            <br />A fresh start on every reload.
          </p>
          <button className="demo-reset" onClick={reset}>
            <RotateCcw size={16} />
            Reset demo
          </button>
        </div>
      </aside>
      <div className="demo-content">
        <header className="demo-topbar">
          <span>
            Workspace / <strong>Attendance demo</strong>
          </span>
          <span className="demo-positive">
            <ShieldCheck size={16} />
            Isolated review
          </span>
        </header>
        <main id="demo-main">
          <div className="demo-banner">
            <span className="demo-live-dot" />
            <p>
              <strong>Interactive review demo.</strong> No sign-in needed. Nothing is sent to SNR.
              Photos and locations stay in this tab.
            </p>
          </div>
          <div className="demo-page-heading">
            <p className="demo-eyebrow">
              {view === 'employee'
                ? 'YOUR WORKDAY, WITH CONFIDENCE'
                : 'SNR NEST · ATTENDANCE REVIEW'}
            </p>
            <h1>{headings[view][0]}</h1>
            <p>{headings[view][1]}</p>
          </div>
          {message && (
            <p className="success-notice demo-notice" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="form-error demo-notice" role="alert">
              {error}
            </p>
          )}
          {view === 'employee' && (
            <div className="demo-two-columns">
              <section className="demo-card demo-punch">
                <div className="demo-punch-heading">
                  <span className="demo-feature-circle">
                    <Clock3 size={27} />
                  </span>
                  <span className={'demo-status ' + (clockedIn ? 'is-in' : '')}>
                    {clockedIn ? 'Clocked in' : 'Clocked out'}
                  </span>
                </div>
                <h2>{clockedIn ? 'Your workday is underway.' : 'Ready when you are.'}</h2>
                <p className="muted">Try each step before the next live release.</p>
                <div className="demo-shift">
                  <div>
                    <small>Assigned store</small>
                    <strong>{site.name}</strong>
                  </div>
                  <div>
                    <small>Sample shift</small>
                    <strong>09:00–18:00 · Asia/Kolkata</strong>
                  </div>
                </div>
                <div className="demo-flow">
                  {[
                    [MapPin, 'Check location'],
                    [Camera, 'Take photo'],
                  ].map(([Icon, text]) => (
                    <div key={text}>
                      <Icon size={22} />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
                <div className="demo-mode" role="group" aria-label="Demo capture mode">
                  <button aria-pressed={mode === 'guided'} onClick={() => setMode('guided')}>
                    Guided sample
                  </button>
                  <button aria-pressed={mode === 'device'} onClick={() => setMode('device')}>
                    Use my camera & location
                  </button>
                </div>
                {mode === 'guided' ? (
                  <label className="demo-scenario">
                    Sample scenario
                    <select value={scenario} onChange={(event) => setScenario(event.target.value)}>
                      <option value="inside">Inside store — accepted</option>
                      <option value="outside">Outside store — blocked</option>
                      <option value="inaccurate">Inaccurate location — blocked</option>
                    </select>
                  </label>
                ) : (
                  <p className="demo-device-note">
                    First set your location in Sites &amp; Shifts. Allow location access; the camera
                    opens only within 50 metres of the store.
                  </p>
                )}
                <label className="demo-consent">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  {mode === 'guided'
                    ? 'I understand these are sample photos and locations.'
                    : 'I agree to use my photo and location for this demo event.'}
                </label>
                <Button
                  className="demo-primary-action"
                  disabled={!consent}
                  onClick={() => {
                    setError('');
                    setMessage('');
                    setCapture(true);
                  }}
                >
                  {clockedIn ? 'Clock out' : 'Clock in'}
                  <ArrowRight size={18} />
                </Button>
                <p className="field-hint">
                  Demo checks run in your browser. Live attendance uses the server’s rules and time.
                </p>
              </section>
              <div className="demo-right-column">
                <section className="demo-card">
                  <span className="demo-feature-circle">
                    <MapPin />
                  </span>
                  <h2>Your store, verified.</h2>
                  <p>
                    Each punch must be within 50 metres of the store, with sufficient location
                    accuracy.
                  </p>
                  <dl className="demo-store-info">
                    <div>
                      <dt>Store centre</dt>
                      <dd>
                        {site.latitude.toFixed(6)}, {site.longitude.toFixed(6)}
                      </dd>
                    </div>
                    <div>
                      <dt>Allowed radius</dt>
                      <dd>{site.radius_meters} metres</dd>
                    </div>
                    <div>
                      <dt>Accuracy</dt>
                      <dd>Must fit within the boundary</dd>
                    </div>
                  </dl>
                  <Button variant="secondary" onClick={() => setView('site')}>
                    Review store location
                    <ArrowRight size={16} />
                  </Button>
                </section>
                <section className="demo-card demo-review-tip">
                  <ShieldCheck size={25} />
                  <h3>What to try</h3>
                  <p>
                    Clock in, review your evidence, then clock out. Try an outside-store scenario to
                    see the request refused.
                  </p>
                  <Button variant="text" onClick={() => setView('records')}>
                    View demo evidence ({records.length})<ArrowRight size={16} />
                  </Button>
                </section>
              </div>
            </div>
          )}
          {view === 'site' && <SiteSetup site={site} onSaved={setSite} />}
          {view === 'records' && <Evidence records={records} />}
        </main>
        <footer className="demo-footer">
          <strong>SNR NEST</strong>
          <span>Attendance review · No live accounts or records connected</span>
        </footer>
      </div>
      {capture &&
        (mode === 'guided' ? (
          <SampleCapture
            site={site}
            scenario={scenario}
            clockedIn={clockedIn}
            onClose={() => setCapture(false)}
            onConfirm={saveRecord}
          />
        ) : (
          <AttendanceCapture
            checkLocation={checkLocation}
            siteName={site.name}
            clockedIn={clockedIn}
            busy={busy}
            onClose={() => setCapture(false)}
            onConfirm={confirmDevice}
          />
        ))}
    </div>
  );
}
