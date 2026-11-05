import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import DataTable from '../../components/dashboard/DataTable';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import Modal from '../../components/common/Modal';
import FormField from '../../components/forms/FormField';

export default function CorrectionList({ compact = false }) {
  const { role, data, dispatch } = useWorkspace();
  const [selected, setSelected] = useState(null);
  const isEmployee = role === 'employee';
  const isHR = role === 'hr';
  const rows = compact
    ? data.corrections.filter((item) => item.status === 'Pending').slice(0, 3)
    : data.corrections;
  function close() {
    setSelected(null);
  }
  function submit(event) {
    event.preventDefault();
    const decision = event.nativeEvent.submitter?.value;
    if (!decision) return;
    const note = String(new FormData(event.currentTarget).get('note') || '').trim();
    dispatch({ type: 'review', id: selected.id, decision, final: isHR, note });
    close();
  }
  return (
    <>
      <DataTable
        caption={isEmployee ? 'My correction requests' : 'Correction review queue'}
        rows={rows}
        emptyTitle="No requests to review"
        emptyDescription="New correction requests will appear here."
        columns={[
          ...(!isEmployee
            ? [
                {
                  key: 'name',
                  label: 'Employee',
                  render: (row) => (
                    <span className="table-date">
                      <strong>{row.name}</strong>
                      <small>{row.id}</small>
                    </span>
                  ),
                },
              ]
            : []),
          { key: 'date', label: 'Attendance date' },
          {
            key: 'type',
            label: 'Correction',
            render: (row) => (
              <span>
                {row.type} · {row.time}
              </span>
            ),
          },
          {
            key: 'status',
            label: 'Status',
            render: (row) => <StatusBadge>{row.status}</StatusBadge>,
          },
          {
            key: 'action',
            label: 'Details',
            render: (row) => (
              <Button
                variant="text"
                aria-label={`${isEmployee || row.status !== 'Pending' ? 'View' : 'Review'} request ${row.id}`}
                onClick={() => setSelected(row)}
              >
                {isEmployee || row.status !== 'Pending' ? 'View' : 'Review'}
                <ArrowUpRight size={15} />
              </Button>
            ),
          },
        ]}
      />
      {selected && (
        <Modal
          title={`${isEmployee ? 'Request' : 'Review request'} ${selected.id}`}
          onClose={close}
        >
          <dl className="detail-grid">
            <div>
              <dt>Employee</dt>
              <dd>{selected.name}</dd>
            </div>
            <div>
              <dt>Attendance date</dt>
              <dd>{selected.date}</dd>
            </div>
            <div>
              <dt>Requested correction</dt>
              <dd>
                {selected.type} · {selected.time}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge>{selected.status}</StatusBadge>
              </dd>
            </div>
          </dl>
          <div className="request-reason">
            <h3>Employee’s reason</h3>
            <p>{selected.reason}</p>
          </div>
          <p className="muted">
            Supervisor recommendation:{' '}
            <strong>{selected.recommendation || 'Awaiting review'}</strong>
          </p>
          {selected.reviewNote && <p className="muted">Review note: {selected.reviewNote}</p>}
          {!isEmployee && selected.status === 'Pending' && (
            <form className="stack-form" onSubmit={submit}>
              <FormField
                label="Review note"
                hint="Add a short explanation (at least 5 characters)."
              >
                {(props) => (
                  <textarea
                    {...props}
                    name="note"
                    required
                    minLength={5}
                    maxLength={1000}
                    rows={3}
                  />
                )}
              </FormField>
              <div className="modal-actions">
                <Button variant="secondary" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  name="decision"
                  value={isHR ? 'Rejected' : 'Flagged'}
                >
                  {isHR ? 'Reject Request' : 'Flag Request'}
                </Button>
                <Button type="submit" name="decision" value={isHR ? 'Approved' : 'Recommended'}>
                  {isHR ? 'Approve Request' : 'Recommend Request'}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}
