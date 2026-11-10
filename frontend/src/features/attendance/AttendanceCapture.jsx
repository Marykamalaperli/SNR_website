import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, MapPin, QrCode } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import AttendanceCamera from './AttendanceCamera';
import { STORE_QR_PATTERN } from '../../services/attendanceCaptureService';

export default function AttendanceCapture({
  clockedIn,
  siteName,
  onConfirm,
  onClose,
  busy,
  verifyQr,
}) {
  const [stage, setStage] = useState('intro');
  const [qr, setQr] = useState('');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const active = useRef(true);
  const verifying = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const scanned = useCallback(
    async (value) => {
      if (verifying.current) return;
      verifying.current = true;
      setStage('intro');
      setError('');
      setChecking(true);
      try {
        if (!STORE_QR_PATTERN.test(value))
          throw new Error('Scan the SNR attendance QR displayed at your store.');
        await verifyQr(value);
        if (!active.current) return;
        setQr(value);
        setStage('photo');
      } catch (failure) {
        if (active.current) setError(failure.message);
      } finally {
        verifying.current = false;
        if (active.current) setChecking(false);
      }
    },
    [verifyQr],
  );
  const action = clockedIn ? 'clock out' : 'clock in';
  return (
    <Modal
      title={clockedIn ? 'Clock out at your store' : 'Clock in at your store'}
      onClose={onClose}
      busy={busy}
    >
      <ol className="attendance-capture-steps" aria-label="Attendance steps">
        <li aria-current={stage === 'intro' || stage === 'scan' ? 'step' : undefined}>
          <QrCode size={18} />
          Scan QR
        </li>
        <li aria-current={stage === 'photo' || stage === 'review' ? 'step' : undefined}>
          <Camera size={18} />
          Take photo
        </li>
        <li>
          <MapPin size={18} />
          Verify location
        </li>
      </ol>
      <p className="muted">
        Your store · <strong>{siteName}</strong>
      </p>
      {stage === 'intro' && (
        <>
          <p>
            Scan the QR displayed at this store. Then take a fresh photo of yourself before we
            request your precise location.
          </p>
          <Button
            onClick={() => {
              setError('');
              setStage('scan');
            }}
            disabled={checking}
          >
            {checking ? 'Checking store QR…' : 'Start QR scanner'}
          </Button>
        </>
      )}
      {stage === 'scan' && <AttendanceCamera scanning onScan={scanned} />}
      {stage === 'photo' && (
        <>
          <p className="success-notice">Store QR verified.</p>
          <p>Face the camera and take a clear photo of yourself for this attendance event.</p>
          <AttendanceCamera
            onPhoto={(value) => {
              setPhoto(value);
              setStage('review');
            }}
          />
        </>
      )}
      {stage === 'review' && photo && (
        <div className="attendance-photo-review">
          <img
            src={'data:image/jpeg;base64,' + photo.jpeg_base64}
            alt="Your attendance photo for review"
          />
          <p>
            Your photo and a fresh device location will be saved with this punch. The location must
            fit inside the store’s saved attendance area.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setPhoto(null);
                setStage('photo');
              }}
            >
              Retake photo
            </Button>
            <Button disabled={busy} onClick={() => onConfirm({ qr, photo })}>
              {busy ? 'Verifying location and saving…' : 'Confirm ' + action}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="field-hint">
        Camera and location are used for this punch only. You and HR can view the saved evidence.
      </p>
    </Modal>
  );
}
