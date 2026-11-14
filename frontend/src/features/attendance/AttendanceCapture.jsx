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
}) {
  const [photo, setPhoto] = useState(null);
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
          <p>Your photo and its capture location will be saved with this punch.</p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setPhoto(null)} disabled={busy}>
              Retake photo
            </Button>
            <Button onClick={() => onConfirm({ photo })} disabled={busy}>
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
