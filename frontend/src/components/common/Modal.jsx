import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({ title, onClose, children }) {
  const ref = useRef(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={id}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
