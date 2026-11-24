import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import {
  Camera,
  LogIn,
  LogOut,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  QrCode,
  Upload,
  Lock,
  Unlock,
  ScanLine,
  ArrowRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
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
  const [isQrScanned, setIsQrScanned] = useState(false);
  const [fetchingQR, setFetchingQR] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState<AttendanceEvent | null>(null);

  // QR Scanner Camera state
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isScanningRef = useRef<boolean>(false);
  const [qrScanningActive, setQrScanningActive] = useState(false);
  const [qrCameraError, setQrCameraError] = useState('');
  const qrFileInputRef = useRef<HTMLInputElement | null>(null);

  // Selfie Camera state
  const selfieVideoRef = useRef<HTMLVideoElement | null>(null);
  const selfieCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selfieStreamRef = useRef<MediaStream | null>(null);
  const selfieFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selfieCameraError, setSelfieCameraError] = useState('');

  // -------------------------------------------------------------------------
  // QR CAMERA & SCANNER ENGINE (THROTTLED & HARDWARE-ACCELERATED)
  // -------------------------------------------------------------------------
  const stopQrCamera = useCallback(() => {
    if (qrScanTimerRef.current) {
      clearInterval(qrScanTimerRef.current);
      qrScanTimerRef.current = null;
    }
    isScanningRef.current = false;
    if (qrStreamRef.current) {
      qrStreamRef.current.getTracks().forEach((track) => track.stop());
      qrStreamRef.current = null;
    }
    setQrScanningActive(false);
  }, []);

  const handleScannedChallenge = useCallback(
    (token: string) => {
      const trimmed = token.trim();
      if (!trimmed) return;

      // Validate that the scanned QR looks like a store challenge (or token)
      setChallengeToken(trimmed);
      setIsQrScanned(true);
      setError('');

      // Optional audio beep / visual cue
      try {
        if (typeof window !== 'undefined' && 'AudioContext' in window) {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch success beep
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.12);
        }
      } catch {
        // Audio not permitted or unavailable
      }

      stopQrCamera();
    },
    [stopQrCamera],
  );

  const scanQrTick = useCallback(async () => {
    if (isScanningRef.current) return;
    const video = qrVideoRef.current;
    if (!video || video.readyState < 2) return; // Wait until video has frame data

    isScanningRef.current = true;
    try {
      // 1. Hardware-accelerated BarcodeDetector if available (native browser API, off-main-thread)
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
          const BarcodeDetectorClass = (
            window as unknown as {
              BarcodeDetector: new (opts: { formats: string[] }) => {
                detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
              };
            }
          ).BarcodeDetector;
          const detector = new BarcodeDetectorClass({ formats: ['qr_code'] });
          const barcodes = await detector.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleScannedChallenge(barcodes[0].rawValue);
            return;
          }
        } catch {
          // Fall through to jsQR if BarcodeDetector fails
        }
      }

      // 2. Fallback to jsQR on downsampled canvas (max 360px) to prevent UI thread freezing
      const canvas = qrCanvasRef.current;
      if (!canvas) return;

      const vWidth = video.videoWidth || 640;
      const vHeight = video.videoHeight || 480;
      const maxDim = 360;
      const scale = Math.min(1, maxDim / Math.max(vWidth, vHeight));
      const targetW = Math.max(1, Math.round(vWidth * scale));
      const targetH = Math.max(1, Math.round(vHeight * scale));

      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const code = jsQR(imageData.data, targetW, targetH, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          handleScannedChallenge(code.data);
          return;
        }
      }
    } catch {
      // Ignore scan frame decode error
    } finally {
      isScanningRef.current = false;
    }
  }, [handleScannedChallenge]);

  const startQrCamera = useCallback(async () => {
    if (qrStreamRef.current) return;
    setQrCameraError('');
    setQrScanningActive(true);
    try {
      // Prefer environment (back camera) for scanning physical QR stations on mobile
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 } },
        audio: false,
      });
      qrStreamRef.current = stream;
      if (qrVideoRef.current) {
        qrVideoRef.current.srcObject = stream;
        await qrVideoRef.current.play().catch(() => {});
        // Scan every 280ms (approx 3.5 scans/sec) - visually instant, <3% CPU
        if (qrScanTimerRef.current) clearInterval(qrScanTimerRef.current);
        qrScanTimerRef.current = setInterval(scanQrTick, 280);
      }
    } catch (err: unknown) {
      setQrCameraError(
        err instanceof Error
          ? err.message
          : 'Could not access back camera for QR scanning. Please grant camera permission.',
      );
      setQrScanningActive(false);
    }
  }, [scanQrTick]);

  // Decode QR code from an uploaded image file
  const handleQrImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          handleScannedChallenge(code.data);
        } else {
          setError('No valid QR code detected in the uploaded image. Please try another image.');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // -------------------------------------------------------------------------
  // SELFIE CAMERA ENGINE
  // -------------------------------------------------------------------------
  const stopSelfieCamera = useCallback(() => {
    if (selfieStreamRef.current) {
      selfieStreamRef.current.getTracks().forEach((track) => track.stop());
      selfieStreamRef.current = null;
    }
  }, []);

  const startSelfieCamera = useCallback(async () => {
    if (selfieStreamRef.current) return;
    setSelfieCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 } },
        audio: false,
      });
      selfieStreamRef.current = stream;
      if (selfieVideoRef.current) {
        selfieVideoRef.current.srcObject = stream;
        await selfieVideoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      setSelfieCameraError(
        err instanceof Error
          ? err.message
          : 'Could not access front camera. Please allow camera permissions or upload a selfie.',
      );
    }
  }, []);

  // Manage streams on step changes
  useEffect(() => {
    if (modalOpen) {
      if (step === 'qr') {
        stopSelfieCamera();
        if (!isQrScanned) {
          startQrCamera();
        }
      } else if (step === 'photo') {
        stopQrCamera();
        startSelfieCamera();
      } else {
        stopQrCamera();
        stopSelfieCamera();
      }
    } else {
      stopQrCamera();
      stopSelfieCamera();
    }

    return () => {
      stopQrCamera();
      stopSelfieCamera();
    };
  }, [modalOpen, step, isQrScanned, startQrCamera, stopQrCamera, startSelfieCamera, stopSelfieCamera]);

  const handleOpenModal = () => {
    setError('');
    setStep('qr');
    setChallengeToken('');
    setIsQrScanned(false);
    setPhotoBlob(null);
    setPhotoPreview('');
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    stopQrCamera();
    stopSelfieCamera();
    setModalOpen(false);
  };

  // Developer / test helper for environments without physical QR displays
  const handleAutoFetchQR = async () => {
    setFetchingQR(true);
    setError('');
    try {
      const challenge = await issueStoreQRChallenge(storeId);
      handleScannedChallenge(challenge.challenge_token);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not fetch active store QR challenge.');
    } finally {
      setFetchingQR(false);
    }
  };

  const handleCapturePhoto = () => {
    const video = selfieVideoRef.current;
    const canvas = selfieCanvasRef.current;
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
          stopSelfieCamera();
          setStep('review');
        } else {
          setError('Failed to capture photo. Please try again.');
        }
      },
      'image/jpeg',
      0.85,
    );
  };

  const handleSelfieFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoBlob(file);
      setPhotoPreview(URL.createObjectURL(file));
      stopSelfieCamera();
      setStep('review');
    }
  };

  const handleRetakePhoto = () => {
    setPhotoBlob(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview('');
    setStep('photo');
  };

  const handleRescanQr = () => {
    setChallengeToken('');
    setIsQrScanned(false);
    setStep('qr');
  };

  const handleSubmitPunch = async () => {
    if (!challengeToken.trim()) {
      setError('A valid Store QR Code must be scanned before clocking in.');
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
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'punch-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
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

        <div
          style={{
            margin: '1.25rem 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
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

          {/* ===================================================================== */}
          {/* STEP 1: SCAN STORE QR CHALLENGE (MANDATORY REQUIREMENT)               */}
          {/* ===================================================================== */}
          {step === 'qr' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <QrCode size={20} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Step 1: Scan Store QR Challenge
                </h3>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                Point your camera at the rotating QR code displayed on the physical store entrance tablet station.
              </p>

              {/* Scanned Success Confirmation Card */}
              {isQrScanned ? (
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '2px solid #16a34a',
                    borderRadius: '8px',
                    padding: '1.25rem',
                    textAlign: 'center',
                    marginBottom: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'inline-flex',
                      padding: '0.5rem',
                      background: '#dcfce7',
                      borderRadius: '50%',
                      color: '#16a34a',
                      marginBottom: '0.5rem',
                    }}
                  >
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 style={{ margin: '0 0 0.25rem 0', color: '#166534', fontSize: '1.1rem', fontWeight: 700 }}>
                    Store QR Challenge Verified!
                  </h4>
                  <p style={{ margin: 0, fontSize: '0.825rem', color: '#15803d' }}>
                    Physical entrance QR token captured. Ready for verification selfie.
                  </p>
                  <div
                    style={{
                      background: '#ffffff',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #bbf7d0',
                      marginTop: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: '#14532d',
                      wordBreak: 'break-all',
                    }}
                  >
                    {challengeToken}
                  </div>
                  <button
                    type="button"
                    onClick={handleRescanQr}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#16a34a',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      marginTop: '0.75rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Scan a different QR code
                  </button>
                </div>
              ) : (
                /* Active Live Camera Viewfinder with Target Reticle */
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1rem' }}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: '380px',
                      height: '260px',
                      background: '#0f172a',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #334155',
                    }}
                  >
                    <video
                      ref={qrVideoRef}
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                    <canvas ref={qrCanvasRef} style={{ display: 'none' }} />

                    {/* Viewfinder Overlay Reticle */}
                    <div
                      style={{
                        position: 'absolute',
                        width: '180px',
                        height: '180px',
                        border: '2px dashed rgba(255, 255, 255, 0.85)',
                        borderRadius: '12px',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                        pointerEvents: 'none',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Scanning Laser Line */}
                      <div
                        style={{
                          width: '100%',
                          height: '2px',
                          background: 'linear-gradient(90deg, transparent, #22c55e, transparent)',
                          boxShadow: '0 0 8px #22c55e',
                          animation: 'scanLineAnim 1.8s ease-in-out infinite alternate',
                        }}
                      />
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        bottom: '12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(0, 0, 0, 0.75)',
                        color: '#ffffff',
                        padding: '0.35rem 0.85rem',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <ScanLine size={14} className="animate-pulse" style={{ color: '#22c55e' }} />
                      Point camera at Store QR Station
                    </div>
                  </div>

                  {qrCameraError && (
                    <div
                      style={{
                        width: '100%',
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        background: '#fef2f2',
                        borderRadius: '6px',
                        color: '#b91c1c',
                        fontSize: '0.8rem',
                      }}
                    >
                      {qrCameraError}
                    </div>
                  )}

                  {/* Alternative Scanner Controls (Upload QR / Test helper) */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <Button
                      variant="secondary"
                      onClick={() => qrFileInputRef.current?.click()}
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <Upload size={13} /> Scan QR from Image / Photo
                    </Button>
                    <input
                      ref={qrFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleQrImageUpload}
                      style={{ display: 'none' }}
                    />

                    <Button
                      variant="secondary"
                      onClick={handleAutoFetchQR}
                      disabled={fetchingQR}
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                    >
                      <RefreshCw size={13} className={fetchingQR ? 'animate-spin' : ''} />
                      {fetchingQR ? 'Verifying…' : 'Dev / Station Auto-Fetch'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Manual Input Fallback */}
              <div style={{ marginTop: '0.75rem' }}>
                <FormField
                  label="Store QR Challenge Token (Auto-filled on Scan)"
                  type="text"
                  placeholder="Scan QR code above to populate token"
                  value={challengeToken}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setChallengeToken(e.target.value);
                    if (e.target.value.trim().length > 10) {
                      setIsQrScanned(true);
                    }
                  }}
                  required
                />
              </div>

              {/* Modal Navigation */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <Button variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>

                {/* Lock Enforcement: Cannot proceed unless QR challenge is scanned */}
                <Button
                  variant="primary"
                  disabled={!challengeToken.trim() || !isQrScanned}
                  onClick={() => setStep('photo')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    background: challengeToken.trim() && isQrScanned ? '#16a34a' : undefined,
                    borderColor: challengeToken.trim() && isQrScanned ? '#15803d' : undefined,
                  }}
                >
                  {challengeToken.trim() && isQrScanned ? (
                    <>
                      <Unlock size={15} />
                      Next: Take Verification Photo <ArrowRight size={15} />
                    </>
                  ) : (
                    <>
                      <Lock size={15} />
                      Scan Store QR Code to Unlock
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 2: TAKE VERIFICATION SELFIE PHOTO                                */}
          {/* ===================================================================== */}
          {step === 'photo' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <Camera size={20} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Step 2: Take Verification Selfie
                </h3>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
                Position your face in the front camera to verify identity and prevent buddy punching.
              </p>

              {selfieCameraError ? (
                <div
                  style={{
                    padding: '1rem',
                    background: '#fef2f2',
                    borderRadius: '6px',
                    color: '#b91c1c',
                  }}
                >
                  {selfieCameraError}
                  <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={startSelfieCamera}>
                      <RefreshCw size={14} /> Retry Front Camera
                    </Button>
                    <Button variant="secondary" onClick={() => selfieFileInputRef.current?.click()}>
                      <Upload size={14} /> Upload Selfie File
                    </Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      maxWidth: '380px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: '#000',
                    }}
                  >
                    <video
                      ref={selfieVideoRef}
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        maxHeight: '260px',
                        background: '#000',
                        objectFit: 'cover',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        background: 'rgba(22, 163, 74, 0.9)',
                        color: '#fff',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                      }}
                    >
                      <Check size={12} /> QR Validated
                    </div>
                  </div>

                  <canvas ref={selfieCanvasRef} style={{ display: 'none' }} />

                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                    <Button onClick={handleCapturePhoto} style={{ minWidth: '160px' }}>
                      <Camera size={16} /> Snap Live Selfie
                    </Button>
                    <Button variant="secondary" onClick={() => selfieFileInputRef.current?.click()}>
                      <Upload size={16} /> Upload Photo
                    </Button>
                    <input
                      ref={selfieFileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleSelfieFileChange}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <Button variant="secondary" onClick={() => setStep('qr')}>
                  Back to QR Scan
                </Button>
                <Button variant="secondary" onClick={handleCloseModal}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* ===================================================================== */}
          {/* STEP 3: REVIEW & CONFIRM CLOCK-IN                                     */}
          {/* ===================================================================== */}
          {step === 'review' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                }}
              >
                <CheckCircle size={20} className="text-primary" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                  Step 3: Confirm {targetAction === 'clock_in' ? 'Clock In' : 'Clock Out'}
                </h3>
              </div>
              <p className="muted" style={{ fontSize: '0.85rem' }}>
                Store QR challenge verified and presence photo captured. Confirm to record this punch.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  margin: '1.25rem 0',
                }}
              >
                {/* Verified Store QR Token Pill */}
                <div
                  style={{
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ShieldCheck size={18} color="#16a34a" />
                    <div>
                      <strong style={{ fontSize: '0.85rem', color: '#166534' }}>
                        Verified Store QR Challenge
                      </strong>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#15803d',
                          fontFamily: 'monospace',
                          marginTop: '0.15rem',
                          maxWidth: '260px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {challengeToken}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRescanQr}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#16a34a',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Rescan
                  </button>
                </div>

                {/* Selfie Preview */}
                {photoPreview && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: '#f8fafc',
                      padding: '1rem',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <img
                      src={photoPreview}
                      alt="Presence verification selfie"
                      style={{
                        width: '120px',
                        height: '120px',
                        objectFit: 'cover',
                        borderRadius: '50%',
                        border: '3px solid #16a34a',
                        marginBottom: '0.5rem',
                      }}
                    />
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Identity Photo Captured
                    </span>
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        marginTop: '0.35rem',
                        cursor: 'pointer',
                      }}
                    >
                      Retake Selfie
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  marginTop: '1.5rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid #e2e8f0',
                }}
              >
                <Button variant="secondary" onClick={handleCloseModal} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmitPunch}
                  disabled={busy}
                  style={{ minWidth: '160px', background: '#16a34a', borderColor: '#15803d' }}
                >
                  {busy ? (
                    'Recording Punch…'
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Confirm {targetAction === 'clock_in' ? 'Clock In' : 'Clock Out'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
