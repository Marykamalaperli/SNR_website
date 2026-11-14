import { useCallback, useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { manageEmployeeSecurity } from '../../services/securityAttendanceService';

export default function EmployeeSecurity({ record, onClose }) {
  const loader = useCallback(() => manageEmployeeSecurity(record.id), [record.id]);
  const data = useRemoteData(loader);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirm, setConfirm] = useState(null);
  async function save(values) {
    setBusy(true);
    setError('');
    try {
      await manageEmployeeSecurity(record.id, values);
      setConfirm(null);
      data.reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Attendance security · ${record.display_name}`} onClose={onClose} busy={busy}>
      <p>
        Approve a passkey only after verifying this employee in person. A password alone must not
        authorize enrollment by someone else.
      </p>
      {data.loading && <LoadingState />}
      {(data.error || error) && <ErrorState description={data.error || error} />}
      {data.data && (
        <>
          <label className="form-field">
            Random photo checks per attendance session
            <select
              aria-label="Random photo checks"
              value={data.data.checks_per_shift}
              disabled={busy}
              onChange={(event) => save({ checks: Number(event.target.value) })}
            >
              <option value="0">Off</option>
              <option value="3">3 checks</option>
              <option value="4">4 checks</option>
            </select>
          </label>
          <p>
            Apply three or four checks to security staff as required. This setting applies to future
            clock-ins. Each random request has a two-minute window and requires fresh in-store
            location and a selfie.
          </p>
          {data.data.credentials.length === 0 && (
            <p>
              No passkey is enrolled. Ask the employee to sign in to the security attendance page on
              their own device and enroll one.
            </p>
          )}
          {data.data.credentials.map((credential) => (
            <section key={credential.id} className="notice">
              <strong>
                {credential.approved ? 'Approved passkey' : 'Awaiting in-person verification'}
              </strong>
              <p>Website: {credential.rp_id}</p>
              {!credential.approved && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    setConfirm({ credentialId: credential.id, version: credential.version })
                  }
                >
                  Approve after identity check
                </Button>
              )}
            </section>
          ))}
          {data.data.credentials.length > 0 && (
            <Button variant="secondary" onClick={() => setConfirm({ reset: true })} disabled={busy}>
              Reset attendance passkey
            </Button>
          )}
          {confirm && (
            <div className="notice">
              <p>
                {confirm.reset
                  ? 'Resetting disables the current passkey and attendance screen immediately. Verify the employee in person before they enroll another.'
                  : 'I have verified the employee in person and confirmed this is their own passkey enrollment.'}
              </p>
              <div className="modal-actions">
                <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={() => save(confirm)} disabled={busy}>
                  Confirm identity verification
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
