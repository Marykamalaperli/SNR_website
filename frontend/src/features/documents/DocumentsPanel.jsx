import { useState } from 'react';
import { FileText, ArrowUpRight } from 'lucide-react';
import { useWorkspace } from '../../hooks/useWorkspace';
import Card from '../../components/common/Card';
import Modal from '../../components/common/Modal';
import Button from '../../components/common/Button';

export default function DocumentsPanel() {
  const { data } = useWorkspace();
  const [selected, setSelected] = useState(null);
  return (
    <>
      <div className="document-grid">
        {data.documents.map((document) => (
          <Card key={document.id} className="document-card">
            <span className="feature-icon tone-orange">
              <FileText />
            </span>
            <h2>{document.name}</h2>
            <p className="muted">{document.category}</p>
            <small>Sample updated {document.updated}</small>
            <Button variant="secondary" onClick={() => setSelected(document)}>
              Read sample <ArrowUpRight size={16} />
            </Button>
          </Card>
        ))}
      </div>
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p className="notice">Sample document · For design review only</p>
          <p>{selected.content}</p>
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        </Modal>
      )}
    </>
  );
}
