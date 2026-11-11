import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadEmployeeQr } from '../../services/attendanceService';

export default function EmployeeQr({ employeeId, onClose }) {
  const loader = useCallback(() => loadEmployeeQr(employeeId), [employeeId]);
  const qr = useRemoteData(loader);
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replacement, setReplacement] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const data = replacement || qr.data;
  useEffect(() => {
    let active = true;
    if (data) {
      const link = new URL('/me/attendance', window.location.origin);
      link.hash = 'employee-qr=' + data.token;
      QRCode.toDataURL(link.href, { width: 480, margin: 4, errorCorrectionLevel: 'M' }).then(
        (src) => {
          if (active) setImage({ data, src });
        },
        () => {
          if (active) setError('The QR image could not be created. Reopen this window.');
        },
      );
    }
    return () => {
      active = false;
    };
  }, [data]);
  async function regenerate() {
    setBusy(true);
    setError('');
    setImage(null);
    try {
      setReplacement(await loadEmployeeQr(employeeId, true, data.version));
      setConfirm(false);
    } catch (failure) {
      setError(failure.message + ' Reopen this window to check the current QR before retrying.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Employee attendance QR" onClose={onClose} busy={busy}>
      {qr.loading && <LoadingState label="Loading employee QR…" />}
      {(qr.error || error) && (
        <ErrorState title="QR could not be confirmed" description={qr.error || error} />
      )}
      {data && (
        <>
          <h3>{data.display_name}</h3>
          <p>
            Scan this personal QR to open attendance. The employee must sign in to their own
            account, verify their store location and take a selfie.
          </p>
          {image?.data === data && (
            <>
              <img
                src={image.src}
                width="240"
                height="240"
                alt={`Attendance QR for ${data.display_name}`}
              />
              <p>
                <Button href={image.src} download={`employee-attendance-qr-v${data.version}.png`}>
                  Download QR
                </Button>
              </p>
            </>
          )}
          <p>
            Lost QR? Regenerating immediately disables the previous code, including unfinished
            attendance captures. Recorded attendance stays saved.
          </p>
          {confirm ? (
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setConfirm(false)} disabled={busy}>
                Keep current QR
              </Button>
              <Button onClick={regenerate} disabled={busy || Boolean(error)}>
                {busy ? 'Regenerating…' : 'Confirm regenerate QR'}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setConfirm(true)}
              disabled={busy || Boolean(error)}
            >
              Regenerate QR
            </Button>
          )}
        </>
      )}
    </Modal>
  );
}
