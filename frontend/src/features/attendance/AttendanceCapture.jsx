import { useState } from 'react';
import { Camera, MapPin } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import AttendanceCamera from './AttendanceCamera';

export default function AttendanceCapture({
  clockedIn,
  siteName,
  onConfirm,
  onClose,
  busy,
  checkLocation,
  title,
  confirmLabel,
  witnessName,
  employeeName,
}) {
  const [photo, setPhoto] = useState(null);
  const [guardPhoto, setGuardPhoto] = useState(null);
  const [witnessConfirmed, setWitnessConfirmed] = useState(false);
  return (
    <Modal
      title={title || (clockedIn ? 'Clock out at your store' : 'Clock in at your store')}
      onClose={onClose}
      busy={busy}
    >
      <ol className="attendance-capture-steps" aria-label="Attendance steps">
        <li>
          <MapPin size={18} />
          Verify location within 50 metres
        </li>
        <li>
          <Camera size={18} />
          Take photo
        </li>
      </ol>
      <p className="muted">
        Your store · <strong>{siteName}</strong>
      </p>
      {!photo ? (
        <>
          <p>
            Allow precise location access. The camera opens once your location is confirmed within
            50 metres of this store, and checks again when you take the photo.
          </p>
          <AttendanceCamera
            beforeOpen={checkLocation}
            beforePhoto={checkLocation}
            onPhoto={setPhoto}
          />
        </>
      ) : (
        <>
          <div className="attendance-photo-review">
            <img
              src={'data:image/jpeg;base64,' + photo.jpeg_base64}
              alt="Your attendance photo for review"
            />
          </div>
          <p>Employee photo taken. Keep both people at the store for the separate guard photo.</p>
          {witnessName && !guardPhoto && (
            <section className="guard-photo-stage" aria-label="Guard photo capture">
              <h3>Now take the guard’s photo · {witnessName}</h3>
              <p>
                Hand the device to the guard. Location is checked before the camera and again at the
                shutter. Both photos are private attendance evidence.
              </p>
              <AttendanceCamera
                key="guard-photo"
                beforeOpen={checkLocation}
                beforePhoto={checkLocation}
                onPhoto={setGuardPhoto}
              />
            </section>
          )}
          {guardPhoto && (
            <div className="attendance-photo-review">
              <img
                src={'data:image/jpeg;base64,' + guardPhoto.jpeg_base64}
                alt="Guard’s live approval photo for review"
              />
            </div>
          )}
          {witnessName && (
            <label className="station-witness">
              <input
                type="checkbox"
                checked={witnessConfirmed}
                disabled={busy}
                onChange={(event) => setWitnessConfirmed(event.target.checked)}
              />
              I, {witnessName}, checked {employeeName}’s staff ID in person. This employee is here
              and the live photo matches the person and ID.
            </label>
          )}
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setPhoto(null);
                setGuardPhoto(null);
                setWitnessConfirmed(false);
              }}
              disabled={busy}
            >
              Retake photo
            </Button>
            <Button
              onClick={() =>
                onConfirm({ photo, ...(guardPhoto ? { guard_photo: guardPhoto } : {}) })
              }
              disabled={busy || Boolean(witnessName && (!witnessConfirmed || !guardPhoto))}
            >
              {busy
                ? 'Recording…'
                : confirmLabel || (clockedIn ? 'Confirm clock out' : 'Confirm clock in')}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
