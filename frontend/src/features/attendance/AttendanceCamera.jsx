import { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import Button from '../../components/common/Button';
import {
  openAttendanceCamera,
  stopAttendanceCamera,
  takeAttendancePhoto,
} from '../../services/attendanceCaptureService';

export default function AttendanceCamera({ onPhoto, beforeOpen, beforePhoto }) {
  const video = useRef(null);
  const canvas = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const live = useRef(false);
  const currentStream = useRef(null);
  const locationAllowed = useRef(false);
  const generation = useRef(0);
  const stopMonitor = useRef(() => {});
  useEffect(() => {
    let active = true;
    let stream;
    let monitor;
    let permission;
    let checking = false;
    let revoked = false;
    const session = ++generation.current;
    live.current = true;
    function halt(message) {
      locationAllowed.current = false;
      clearInterval(monitor);
      stopAttendanceCamera(stream);
      if (active) {
        setError(message);
        setReady(false);
      }
    }
    stopMonitor.current = () => {
      clearInterval(monitor);
    };
    const visibilityChanged = () => {
      if (document.hidden)
        halt('Camera paused. Return to this page and verify your location again.');
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    const permissionChanged = () => {
      if (permission && permission.state !== 'granted') {
        revoked = true;
        halt(
          'Location is off or permission was denied. Enable precise location before reopening the camera.',
        );
      }
    };
    async function recheck() {
      if (checking || !active) return;
      checking = true;
      try {
        await beforeOpen();
      } catch (failure) {
        halt(failure.message);
        clearInterval(monitor);
      } finally {
        checking = false;
      }
    }
    async function start() {
      try {
        if (!beforeOpen) throw new Error('Location must be verified before opening the camera.');
        setCheckingLocation(true);
        await beforeOpen();
        if (!active) return;
        try {
          permission = await navigator.permissions?.query({ name: 'geolocation' });
          if (!active) return;
          permission?.addEventListener('change', permissionChanged);
          permissionChanged();
        } catch {
          /* Some browsers only expose getCurrentPosition permission. */
        }
        if (revoked || document.hidden)
          throw new Error('Enable location and keep this page open before using the camera.');
        setCheckingLocation(false);
        stream = await openAttendanceCamera('user');
        if (!active) return stopAttendanceCamera(stream);
        if (revoked || document.hidden)
          throw new Error('Location access changed or the page was hidden. Reopen the camera.');
        currentStream.current = stream;
        video.current.srcObject = stream;
        await video.current.play();
        if (!active) return;
        if (revoked || document.hidden)
          throw new Error('Location access changed or the page was hidden. Reopen the camera.');
        setReady(true);
        locationAllowed.current = true;
        monitor = setInterval(recheck, 10000);
      } catch (failure) {
        stopAttendanceCamera(stream);
        if (active) {
          setError(failure.message);
          setCheckingLocation(false);
        }
      }
    }
    start();
    return () => {
      active = false;
      live.current = false;
      generation.current = session + 1;
      locationAllowed.current = false;
      clearInterval(monitor);
      permission?.removeEventListener('change', permissionChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      stopAttendanceCamera(stream);
    };
  }, [attempt, beforeOpen]);
  async function photograph() {
    const session = generation.current;
    try {
      setCheckingLocation(true);
      if (!beforePhoto) throw new Error('Verify your location before taking this photo.');
      const location = await beforePhoto();
      if (!live.current || session !== generation.current) return;
      if (!locationAllowed.current)
        throw new Error('Location access changed. Enable location and reopen the camera.');
      onPhoto({
        ...takeAttendancePhoto(video.current, canvas.current),
        location_at_capture: location,
      });
    } catch (failure) {
      if (session !== generation.current) return;
      stopMonitor.current();
      stopAttendanceCamera(currentStream.current);
      locationAllowed.current = false;
      if (live.current) {
        setError(failure.message);
        setReady(false);
      }
    } finally {
      if (live.current && session === generation.current) setCheckingLocation(false);
    }
  }
  return (
    <div className="attendance-camera">
      <video ref={video} autoPlay muted playsInline aria-label="Photo camera" />
      <canvas ref={canvas} hidden />
      {!ready && !error && (
        <p role="status">{checkingLocation ? 'Verifying store location…' : 'Opening camera…'}</p>
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
        <Button onClick={photograph} disabled={!ready || checkingLocation}>
          <Camera size={18} aria-hidden="true" />
          {checkingLocation ? 'Verifying location…' : 'Take photo'}
        </Button>
      )}
    </div>
  );
}
