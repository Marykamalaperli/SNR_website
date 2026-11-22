import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, LogIn, LogOut, CheckCircle, AlertCircle, RefreshCw, QrCode, Upload } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import FormField from '../../components/forms/FormField';
import StatusBadge from '../../components/common/StatusBadge';
import {
  AttendanceEvent,
  issueStoreQRChallenge,
  listAttendanceEvents,
  requestPhotoUploadIntent,
  recordAttendanceEvent,
  uploadPhotoBlob,
} from '../../services/targetAttendanceService';

interface TargetPunchCardProps {
  storeId: string;
  storeName?: string;
  latestEvent?: AttendanceEvent | null;
  onPunchSuccess?: (event: AttendanceEvent) => void;
}

export default function TargetPunchCard({
  storeId,
  storeName = 'Assigned Store',
  latestEvent: initialLatestEvent = null,
  onPunchSuccess,
}: TargetPunchCardProps) {
  const [latestEvent, setLatestEvent] = useState<AttendanceEvent | null>(initialLatestEvent);
  const [fetchingStatus, setFetchingStatus] = useState<boolean>(!initialLatestEvent);

  // Load latest event on mount
  const refreshLatestPunch = useCallback(async () => {
    setFetchingStatus(true);
    try {
      const data = await listAttendanceEvents({ limit: 1 });
      if (data.items && data.items.length > 0) {
        setLatestEvent(data.items[0]);
      } else {
        setLatestEvent(null);
      }
    } catch {
      // Keep previous
    } finally {
      setFetchingStatus(false);
    }
  }, []);

  useEffect(() => {
    refreshLatestPunch();
  }, [refreshLatestPunch]);

  const isClockedIn = latestEvent?.action === 'clock_in';
  const targetAction: 'clock_in' | 'clock_out' = isClockedIn ? 'clock_out' : 'clock_in';

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState<'qr' | 'photo' | 'review'>('qr');
  const [challengeToken, setChallengeToken] = useState('');
  const [fetchingQR, setFetchingQR] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState<AttendanceEvent | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [cameraError, setCameraError] = useState('');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      setCameraError(
        err instanceof Error ? err.message : 'Could not access camera. Please allow camera permissions or upload a selfie.',
      );
    }
  };

  useEffect(() => {
    if (modalOpen && step === 'photo') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [modalOpen, step]);

  const handleOpenModal = () => {
    setError('');
    setStep('qr');
    setPhotoBlob(null);
    setPhotoPreview('');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    stopCamera();
    setModalOpen(false);
  };

  const handleAutoFetchQR = async () => {
    setFetchingQR(true);
    setError('');
    try {
      const challenge = await issueStoreQRChallenge(storeId);
      setChallengeToken(challenge.challenge_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch active store QR challenge.');
    } finally {
      setFetchingQR(false);
    }
  };

  const handleCapturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          setPhotoBlob(blob);
          setPhotoPreview(URL.createObjectURL(blob));
          stopCamera();
          setStep('review');
        } else {
          setError('Failed to capture photo. Please try again.');
        }
      },
      'image/jpeg',
      0.85,
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
      stopCamera();
      setStep('review');
    }
  };

  const handleRetake = () => {
    setPhotoBlob(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    setStep('photo');
  };

  const handleSubmitPunch = async () => {
    if (!challengeToken.trim()) {
      setError('Please provide the Store QR Challenge token.');
      setStep('qr');
      return;
    }
    if (!photoBlob) {
      setError('Please take an attendance verification photo.');
      setStep('photo');
      return;
    }

    setBusy(true);
    setError('');
    try {
      // 1. Get presigned photo upload intent
      const intent = await requestPhotoUploadIntent(storeId, 'image/jpeg');

      // 2. Upload photo blob to the presigned url
      await uploadPhotoBlob(intent.upload_url, photoBlob);

      // 3. Submit attendance event with an idempotency key
      const idempotencyKey = crypto.randomUUID();
      const recorded = await recordAttendanceEvent(
        {
          challenge_token: challengeToken.trim(),
          action: targetAction,
          photo_key: intent.photo_key,
          device_info: navigator.userAgent,
        },
        idempotencyKey,
      );

      setLatestEvent(recorded);
      setSuccessBanner(recorded);
      setModalOpen(false);
      onPunchSuccess?.(recorded);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Punch submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="target-punch-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">ATTENDANCE</span>
            <h2 style={{ margin: '0.25rem 0 0' }}>{storeName}</h2>
          </div>
          <StatusBadge tone={isClockedIn ? 'positive' : 'neutral'}>
            {fetchingStatus ? 'Checking…' : isClockedIn ? 'Clocked in' : 'Clocked out'}
          </StatusBadge>
        </div>

        {successBanner && (
          <div
            className="notice notice-success"
            style={{
              margin: '1rem 0',
              padding: '0.75rem 1rem',
              background: '#ecfdf5',
              border: '1px solid #10b981',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <CheckCircle size={20} color="#059669" />
            <div>
              <strong>Successfully recorded {successBanner.action.replace('_', ' ')}!</strong>
              <div style={{ fontSize: '0.875rem', color: '#047857' }}>
                Server receipt time: {new Date(successBanner.server_timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        )}

        <div style={{ margin: '1.25rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Current status</span>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {isClockedIn ? 'You are currently on duty' : 'Not clocked in right now'}
            </div>
            {latestEvent && (
              <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                Last punch: {latestEvent.action.replace('_', ' ')} at{' '}
                {new Date(latestEvent.server_timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>

          <Button
            variant={isClockedIn ? 'secondary' : 'primary'}
            onClick={handleOpenModal}
            style={{ minWidth: '140px' }}
          >
            {isClockedIn ? (
              <>
                <LogOut size={18} />
                Clock Out
              </>
            ) : (
              <>
                <LogIn size={18} />
                Clock In
              </>
            )}
          </Button>
        </div>
      </Card>

      {modalOpen && (
        <Modal
          title={targetAction === 'clock_in' ? 'Clock In at Store' : 'Clock Out at Store'}
          onClose={handleCloseModal}
          busy={busy}
        >
          {error && (
            <div
              className="notice notice-error"
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: '#fef2f2',
                border: '1px solid #ef4444',
                borderRadius: '6px',
                color: '#b91c1c',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {step === 'qr' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <QrCode size={20} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Step 1: Scan Store QR Challenge</h3>
              </div>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Enter or scan the rotating challenge token currently displayed on the store station screen.
              </p>

              <FormField
                label="Store QR Challenge Token"
                type="text"
                placeholder="Paste or scan store QR challenge (e.g. store:timestamp:nonce:sig)"
                value={challengeToken}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setChallengeToken(e.target.value)
                }
                required
              />

              <div style={{ marginTop: '0.75rem' }}>
                <Button variant="secondary" onClick={handleAutoFetchQR} disabled={fetchingQR}>
                  <RefreshCw size={14} className={fetchingQR ? 'animate-spin' : ''} />
                  {fetchingQR ? 'Fetching…' : 'Fetch Store QR (Dev / Auto)'}
                </Button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <Button variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
                <Button
                  disabled={!challengeToken.trim()}
                  onClick={() => setStep('photo')}
                >
                  Next: Take Photo
                </Button>
              </div>
            </div>
          )}

          {step === 'photo' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Camera size={20} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1rem' }}>Step 2: Take Verification Photo</h3>
              </div>
              <p className="muted" style={{ fontSize: '0.875rem' }}>
                Position your face clearly in the camera view to verify your physical presence.
              </p>

              {cameraError ? (
                <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: '6px', color: '#b91c1c' }}>
                  {cameraError}
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={startCamera}>
                      <RefreshCw size={14} /> Retry Camera
                    </Button>
                    <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={14} /> Upload Selfie File
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    style={{
                      width: '100%',
                      maxHeight: '260px',
                      background: '#000',
                      borderRadius: '8px',
                      objectFit: 'cover',
                    }}
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <Button
                      onClick={handleCapturePhoto}
                      style={{ minWidth: '160px' }}
                    >
                      <Camera size={18} />
                      Capture Photo
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={16} />
                      Upload Photo
                    </Button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                <Button variant="secondary" onClick={() => setStep('qr')}>
                  Back
                </Button>
                <Button variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {step === 'review' && (
            <div>
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>Step 3: Confirm & Submit Punch</h3>

              {photoPreview && (
                <div style={{ textAlign: 'center', margin: '1rem 0' }}>
                  <img
                    src={photoPreview}
                    alt="Captured selfie preview"
                    style={{
                      width: '180px',
                      height: '180px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      border: '2px solid #e5e7eb',
                    }}
                  />
                  <div style={{ marginTop: '0.5rem' }}>
                    <Button variant="secondary" onClick={handleRetake} disabled={busy}>
                      Retake Photo
                    </Button>
                  </div>
                </div>
              )}

              <div style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: '6px', fontSize: '0.875rem' }}>
                <div><strong>Action:</strong> {targetAction === 'clock_in' ? 'Clock In' : 'Clock Out'}</div>
                <div><strong>Store:</strong> {storeName}</div>
                <div><strong>Evidence:</strong> Fresh selfie captured</div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <Button variant="secondary" onClick={handleRetake} disabled={busy}>
                  Back
                </Button>
                <Button onClick={handleSubmitPunch} disabled={busy}>
                  {busy ? 'Submitting…' : `Confirm ${targetAction === 'clock_in' ? 'Clock In' : 'Clock Out'}`}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
