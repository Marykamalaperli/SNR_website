import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadStoreQr } from '../../services/workforceService';

export default function StoreAttendanceQr({ site, onClose }) {
  const loader = useCallback(() => loadStoreQr(site.id), [site.id]);
  const { data, loading, error, reload } = useRemoteData(loader);
  const [image, setImage] = useState('');
  const [failure, setFailure] = useState('');
  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  useEffect(() => {
    let active = true;
    if (data)
      QRCode.toDataURL(data.qr, { width: 600, margin: 4, errorCorrectionLevel: 'M' }).then(
        (url) => {
          if (active) setImage(url);
        },
        () => {
          if (active) setFailure('The QR image could not be generated. Reload it and try again.');
        },
      );
    return () => {
      active = false;
    };
  }, [data]);
  async function replace() {
    setSaving(true);
    setFailure('');
    try {
      await loadStoreQr(site.id, true, data.version);
      setImage('');
      setReplacing(false);
      reload();
    } catch (problem) {
      setFailure(problem.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={'Store attendance QR · ' + site.name} onClose={onClose} busy={saving}>
      {loading ? (
        <LoadingState label="Loading store QR…" />
      ) : error ? (
        <ErrorState title="QR could not be loaded" description={error} onRetry={reload} />
      ) : (
        <div className="store-attendance-qr">
          <p>
            Display this QR at {site.name}. Staff scan it for every clock-in and clock-out, then
            take a photo and share their location.
          </p>
          {image && (
            <>
              <img src={image} alt={'Attendance QR for ' + site.name} width="300" height="300" />
              <a
                className="button button-secondary"
                href={image}
                download={'attendance-qr-' + site.id + '.png'}
              >
                Download store QR
              </a>
            </>
          )}
          <p className="field-hint">
            QR version {data?.version}. Display it only at this store. Replacing it makes earlier
            copies invalid for new punches.
          </p>
          {replacing ? (
            <div className="modal-actions">
              <Button variant="secondary" disabled={saving} onClick={() => setReplacing(false)}>
                Keep current QR
              </Button>
              <Button disabled={saving} onClick={replace}>
                {saving ? 'Replacing…' : 'Replace and invalidate old QR'}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" disabled={saving} onClick={() => setReplacing(true)}>
              Replace QR
            </Button>
          )}
        </div>
      )}
      {failure && (
        <p className="form-error" role="alert">
          {failure}
        </p>
      )}
    </Modal>
  );
}
