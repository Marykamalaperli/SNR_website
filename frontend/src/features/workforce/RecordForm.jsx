import { useState } from 'react';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';

export default function RecordForm({
  title,
  onClose,
  onSave,
  children,
  submitLabel = 'Save changes',
  lockFields = false,
  blockSubmit = false,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (saving || blockSubmit) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setSaving(true);
    setError('');
    try {
      await onSave(values);
    } catch (failure) {
      setError(failure.message || 'Your changes could not be saved. Please try again.');
      setSaving(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose} busy={saving}>
      <form className="stack-form" onSubmit={submit}>
        <fieldset className="record-fields" disabled={saving || lockFields}>
          {children}
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || blockSubmit}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
