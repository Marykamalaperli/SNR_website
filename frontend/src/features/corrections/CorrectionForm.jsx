import { useState } from 'react';
import { Send } from 'lucide-react';
import FormField from '../../components/forms/FormField';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { useWorkspace } from '../../hooks/useWorkspace';

export default function CorrectionForm({ onClose }) {
  const { dispatch, sampleDay } = useWorkspace();
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (
      !values.date ||
      values.date > sampleDay ||
      !values.time ||
      values.reason.trim().length < 10
    ) {
      setError(
        'Choose a date on or before the sample day, a time, and a reason of at least 10 characters.',
      );
      return;
    }
    dispatch({
      type: 'correction',
      payload: {
        ...values,
        reason: values.reason.trim(),
        date: new Date(`${values.date}T12:00:00`).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      },
    });
    onClose();
  }
  return (
    <Modal title="Request an attendance correction" onClose={onClose}>
      <p className="muted">
        Tell your supervisor what needs updating. This sample request stays in your browser until
        refresh.
      </p>
      <form className="stack-form" onSubmit={submit}>
        <div className="form-grid">
          <FormField label="Attendance date" name="date" type="date" max={sampleDay} required />
          <FormField label="Correct time" name="time" type="time" required />
        </div>
        <FormField label="What needs correcting?">
          {(props) => (
            <select {...props} name="type">
              <option>Clock-in</option>
              <option>Clock-out</option>
            </select>
          )}
        </FormField>
        <FormField label="Reason" hint="Include enough detail to help your supervisor review it.">
          {(props) => (
            <textarea {...props} name="reason" rows={4} minLength={10} maxLength={1000} required />
          )}
        </FormField>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">
            Submit Request <Send size={16} />
          </Button>
        </div>
      </form>
    </Modal>
  );
}
