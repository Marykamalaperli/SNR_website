import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera } from 'lucide-react';
import Button from '../../components/common/Button';
import {
  openAttendanceCamera,
  stopAttendanceCamera,
  takeAttendancePhoto,
} from '../../services/attendanceCaptureService';

export default function AttendanceCamera({ scanning = false, onScan, onPhoto }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let stream;
    let timer;
    async function start() {
      try {
        stream = await openAttendanceCamera(scanning ? 'environment' : 'user');
        if (!active) return stopAttendanceCamera(stream);
        video.current.srcObject = stream;
        await video.current.play();
        if (!active) return;
        setReady(true);
        if (scanning) {
          const scan = () => {
            if (!active) return;
            const v = video.current;
            const c = canvas.current;
            if (v.videoWidth && v.videoHeight) {
              const scale = Math.min(1, 800 / Math.max(v.videoWidth, v.videoHeight));
              c.width = Math.round(v.videoWidth * scale);
              c.height = Math.round(v.videoHeight * scale);
              const context = c.getContext('2d', { willReadFrequently: true });
              context.drawImage(v, 0, 0, c.width, c.height);
              const pixels = context.getImageData(0, 0, c.width, c.height);
              const code = jsQR(pixels.data, pixels.width, pixels.height);
              if (code?.data) {
                stopAttendanceCamera(stream);
                onScan(code.data);
                return;
              }
            }
            timer = setTimeout(scan, 250);
          };
          timer = setTimeout(scan, 250);
        }
      } catch (failure) {
        stopAttendanceCamera(stream);
        if (active) setError(failure.message);
      }
    }
    start();
    return () => {
      active = false;
      clearTimeout(timer);
      stopAttendanceCamera(stream);
    };
  }, [scanning, onScan, attempt]);
  function photograph() {
    try {
      onPhoto(takeAttendancePhoto(video.current, canvas.current));
    } catch (failure) {
      setError(failure.message);
    }
  }
  return (
    <div className="attendance-camera">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        aria-label={scanning ? 'QR scanner camera' : 'Photo camera'}
      />
      <canvas ref={canvas} hidden />
      {!ready && !error && <p role="status">Opening camera…</p>}
      {scanning && !error && (
        <p role="status">Point the rear camera at the QR displayed at your store.</p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {error ? (
        <Button
          variant="secondary"
          onClick={() => {
            setError('');
            setReady(false);
            setAttempt((v) => v + 1);
          }}
        >
          Retry camera
        </Button>
      ) : (
        !scanning && (
          <Button onClick={photograph} disabled={!ready}>
            <Camera size={18} aria-hidden="true" />
            Take photo
          </Button>
        )
      )}
    </div>
  );
}
