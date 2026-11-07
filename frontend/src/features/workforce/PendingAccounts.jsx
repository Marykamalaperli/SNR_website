import { useState } from 'react';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import { ErrorState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { closePendingAccount, loadPendingAccounts } from '../../services/workforceService';
import { recoverStaffAccount } from '../../services/adminAccountService';

export default function PendingAccounts({ onResolved }) {
  const { data, error, reload } = useRemoteData(loadPendingAccounts);
  const [working, setWorking] = useState(null);
  const [notice, setNotice] = useState('');
  async function run(id, close = false) {
    setWorking(id);
    setNotice('');
    try {
      const result = await (close ? closePendingAccount(id) : recoverStaffAccount(id));
      setNotice(
        result.status === 'completed'
          ? 'Account request completed.'
          : 'Request closed. Review the directory before creating or changing this account again.',
      );
      reload();
      onResolved();
    } catch (failure) {
      setNotice(failure.message);
    } finally {
      setWorking(null);
    }
  }
  if (error)
    return (
      <Card>
        <ErrorState
          title="Account requests could not be loaded"
          description={error}
          onRetry={reload}
        />
      </Card>
    );
  if (!data?.length && !notice) return null;
  return (
    <Card className="pending-accounts">
      <div className="card-heading">
        <div>
          <h2>Pending account requests</h2>
          <p>
            Check interrupted requests here. Closing a request keeps any account changes already
            saved.
          </p>
        </div>
        <Button variant="secondary" onClick={reload} disabled={Boolean(working)}>
          Refresh status
        </Button>
      </div>
      {notice && (
        <p className="pending-notice" role="status">
          {notice}
        </p>
      )}
      <ul>
        {data?.map((operation) => (
          <li key={operation.id}>
            <div>
              <strong>{operation.email}</strong>
              <p>
                {operation.action === 'credentials'
                  ? 'Update login details'
                  : 'Set up staff account'}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={Boolean(working)}
              aria-label={`Check account request ${operation.email}`}
              onClick={() => run(operation.id)}
            >
              {working === operation.id ? 'Checking…' : 'Check request'}
            </Button>
            <Button
              variant="text"
              disabled={Boolean(working) || !operation.can_close}
              aria-label={`Close account request ${operation.email}`}
              onClick={() => run(operation.id, true)}
            >
              Close request
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
