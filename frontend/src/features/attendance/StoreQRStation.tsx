import { useEffect, useState, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import { QrCode, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { issueStoreQRChallenge, StoreQRChallenge } from '../../services/targetAttendanceService';

interface StoreQRStationProps {
  storeId: string;
  storeName?: string;
}

export default function StoreQRStation({
  storeId,
  storeName = 'Store Station',
}: StoreQRStationProps) {
  const [challenge, setChallenge] = useState<StoreQRChallenge | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [secondsRemaining, setSecondsRemaining] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const activeRef = useRef<boolean>(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChallenge = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError('');
    try {
      const data = await issueStoreQRChallenge(storeId);
      if (!activeRef.current) return;
      setChallenge(data);

      const expiresAt = new Date(data.expires_at).getTime();
      const now = Date.now();
      const initialSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setSecondsRemaining(initialSeconds);

      const url = await QRCode.toDataURL(data.challenge_token, {
        width: 300,
        margin: 2,
        color: { dark: '#111827', light: '#ffffff' },
      });
      if (activeRef.current) {
        setQrDataUrl(url);
      }
    } catch (err: unknown) {
      if (activeRef.current) {
        setError(err instanceof Error ? err.message : 'Could not generate store QR challenge.');
      }
    } finally {
      if (activeRef.current) {
        setLoading(false);
      }
    }
  }, [storeId]);

  useEffect(() => {
    activeRef.current = true;
    fetchChallenge();

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchChallenge]);

  // Expiration countdown & automatic refresh
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 5) {
          // Trigger refresh before expiry
          fetchChallenge();
          return 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchChallenge]);

  return (
    <Card className="store-qr-station-card">
      <div className="card-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <QrCode size={22} className="text-primary" />
          <h2 style={{ margin: 0 }}>{storeName} · Live Attendance QR</h2>
        </div>
        <StatusBadge tone={secondsRemaining > 15 ? 'positive' : 'warning'}>
          <Clock size={14} style={{ marginRight: '4px' }} />
          Rotates in {secondsRemaining}s
        </StatusBadge>
      </div>

      <p className="muted" style={{ margin: '0.5rem 0 1.5rem' }}>
        Employees scan this short-lived challenge code with their phone to clock in or clock out.
        The challenge automatically rotates every 60 seconds to prevent replay and proxy attendance.
      </p>

      {error && (
        <div
          className="notice notice-error"
          style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
          <Button variant="secondary" onClick={fetchChallenge} style={{ marginLeft: 'auto' }}>
            Retry
          </Button>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}
      >
        {qrDataUrl ? (
          <img
            src={qrDataUrl}
            alt="Store Attendance QR Code"
            style={{
              width: '280px',
              height: '280px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            }}
          />
        ) : (
          <div
            style={{
              width: '280px',
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#e5e7eb',
              borderRadius: '8px',
            }}
          >
            <span>{loading ? 'Generating QR Code…' : 'No QR available'}</span>
          </div>
        )}

        <div style={{ marginTop: '1rem', width: '100%', maxWidth: '340px' }}>
          <div
            style={{
              height: '6px',
              width: '100%',
              background: '#e5e7eb',
              borderRadius: '3px',
              overflow: 'hidden',
              marginBottom: '0.75rem',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(secondsRemaining / 60) * 100}%`,
                background: secondsRemaining > 15 ? '#10b981' : '#f59e0b',
                transition: 'width 1s linear',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Valid for {secondsRemaining}s
            </span>
            <Button variant="secondary" onClick={fetchChallenge} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Rotate Now
            </Button>
          </div>
        </div>

        {challenge && (
          <div style={{ marginTop: '1.5rem', textAlign: 'center', maxWidth: '400px' }}>
            <span
              style={{
                fontSize: '0.75rem',
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Challenge Token
            </span>
            <div
              style={{
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                color: '#4b5563',
                background: '#ffffff',
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #d1d5db',
                wordBreak: 'break-all',
                marginTop: '0.25rem',
              }}
            >
              {challenge.challenge_token}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
