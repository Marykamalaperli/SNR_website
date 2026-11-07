import { useCallback, useState } from 'react';
import { CalendarDays, Plus } from 'lucide-react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';
import FormField from '../../components/forms/FormField';
import { ErrorState, LoadingState } from '../../components/common/States';
import useRemoteData from '../../hooks/useRemoteData';
import { loadEmployeeShifts, saveEmployeeShift } from '../../services/attendanceService';
import { dateLabel, earlierDate } from '../attendance/attendanceFormat';

export default function EmployeeShifts({ record, onClose }) {
  const loader = useCallback(() => loadEmployeeShifts(record.id), [record.id]);
  const plans = useRemoteData(loader);
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function save(values, assignment, cancel = false) {
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveEmployeeShift(plans.data, values, assignment, cancel);
      setNotice(
        cancel ? 'Assignment cancelled. Its record is retained.' : 'Shift assignment saved.',
      );
      setEditing(null);
      setAdding(false);
      plans.reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal title={`Shifts · ${record.display_name}`} onClose={onClose} busy={saving}>
      <p className="field-hint">
        One shift assignment per work date. End an overlapping assignment before adding another.
        Attendance history is preserved.
      </p>
      {notice && (
        <p className="success-notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {plans.loading ? (
        <LoadingState label="Loading shift assignments…" />
      ) : plans.error ? (
        <ErrorState
          title="Shift assignments could not be loaded"
          description={plans.error}
          onRetry={plans.reload}
        />
      ) : (
        <>
          <div className="live-assignment-list">
            {plans.data.assignments.length === 0 && <p className="muted">No shift assigned yet.</p>}
            {plans.data.assignments.map((assignment) => (
              <div className="live-assignment" key={assignment.id}>
                <CalendarDays size={19} aria-hidden="true" />
                <div>
                  <strong>{assignment.name}</strong>
                  <p>
                    {dateLabel(assignment.starts_on)} –{' '}
                    {assignment.ends_on ? dateLabel(assignment.ends_on) : 'Ongoing'} ·{' '}
                    {assignment.timezone}
                  </p>
                  {assignment.cancelled && <small>Cancelled</small>}
                </div>
                {assignment.can_edit && (
                  <Button
                    variant="text"
                    disabled={saving}
                    aria-label={`Change end date ${assignment.name}`}
                    onClick={() => {
                      setEditing(assignment);
                      setAdding(false);
                      setError('');
                    }}
                  >
                    Change end date
                  </Button>
                )}
                {assignment.can_cancel && (
                  <Button
                    variant="text"
                    disabled={saving}
                    aria-label={`Cancel assignment ${assignment.name}`}
                    onClick={() => save({}, assignment, true)}
                  >
                    Cancel assignment
                  </Button>
                )}
              </div>
            ))}
          </div>
          {!editing && !adding && (
            <Button
              variant="secondary"
              disabled={!plans.data.shifts.length || saving}
              onClick={() => setAdding(true)}
            >
              <Plus size={16} aria-hidden="true" />
              Assign shift
            </Button>
          )}
          {!plans.data.shifts.length && (
            <p className="notice">
              Add a shift template for this person’s site in Sites &amp; Shifts first.
            </p>
          )}
          {(editing || adding) && (
            <form
              className="stack-form live-assignment-form"
              key={editing?.id || 'new'}
              onSubmit={(event) => {
                event.preventDefault();
                save(Object.fromEntries(new FormData(event.currentTarget)), editing);
              }}
            >
              <fieldset className="record-fields" disabled={saving}>
                {editing ? (
                  <p>
                    <strong>{editing.name}</strong> · Starts {dateLabel(editing.starts_on)}
                  </p>
                ) : (
                  <>
                    <FormField label="Shift" name="shift_id" required>
                      {(attributes) => (
                        <select {...attributes} name="shift_id" required defaultValue="">
                          <option value="" disabled>
                            Choose a shift
                          </option>
                          {plans.data.shifts.map((shift) => (
                            <option value={shift.id} key={shift.id}>
                              {shift.name} · {shift.starts_at.slice(0, 5)}–
                              {shift.ends_at.slice(0, 5)} · {shift.timezone}
                            </option>
                          ))}
                        </select>
                      )}
                    </FormField>
                    <FormField
                      label="Starts on"
                      name="starts_on"
                      type="date"
                      required
                      min={plans.data.today}
                      defaultValue={plans.data.today}
                    />
                  </>
                )}
                <FormField
                  label="Ends on"
                  name="ends_on"
                  type="date"
                  min={editing ? earlierDate(plans.data.today, 1) : plans.data.today}
                  defaultValue={editing?.ends_on || ''}
                  hint="Leave blank for an ongoing assignment. Recorded attendance prevents shortening dates already used."
                />
              </fieldset>
              <div className="modal-actions">
                <Button
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    setEditing(null);
                    setAdding(false);
                  }}
                >
                  Cancel edit
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save assignment'}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
