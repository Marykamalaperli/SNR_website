import { useState } from 'react';
import { Search } from 'lucide-react';
import DataTable from './DataTable';
import StatusBadge from '../common/StatusBadge';
import Modal from '../common/Modal';
import Button from '../common/Button';

export default function PeopleTable({
  people,
  directory = false,
  searchable = true,
  caption = 'Team attendance roster',
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState(null);
  const rows = people.filter(
    (person) =>
      `${person.name} ${person.id} ${person.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'All' || (directory ? person.department : person.status) === filter),
  );
  const options = [
    ...new Set(people.map((person) => (directory ? person.department : person.status))),
  ];
  return (
    <>
      {searchable && (
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input
              aria-label="Search employees"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or employee ID"
            />
          </div>
          <select
            aria-label={directory ? 'Filter by department' : 'Filter by attendance status'}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="All">{directory ? 'All departments' : 'All statuses'}</option>
            {options.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      )}
      <DataTable
        caption={caption}
        rows={rows}
        columns={[
          {
            key: 'name',
            label: 'Employee',
            render: (person) => (
              <div className="table-person">
                <span
                  className={`avatar avatar-${person.initials === 'KN' ? 'gold' : person.initials === 'DR' ? 'teal' : 'soft'}`}
                >
                  {person.initials}
                </span>
                <div>
                  <strong>{person.name}</strong>
                  <small>{person.id}</small>
                </div>
              </div>
            ),
          },
          { key: 'department', label: 'Department' },
          { key: directory ? 'site' : 'punch', label: directory ? 'Site' : 'Clock in' },
          {
            key: 'status',
            label: 'Attendance',
            render: (person) => <StatusBadge>{person.status}</StatusBadge>,
          },
          {
            key: 'details',
            label: 'Details',
            render: (person) => (
              <Button
                variant="text"
                aria-label={`View ${person.name}`}
                onClick={() => setSelected(person)}
              >
                View
              </Button>
            ),
          },
        ]}
      />
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <p className="notice">Synthetic employee record</p>
          <dl className="detail-grid">
            <div>
              <dt>Employee ID</dt>
              <dd>{selected.id}</dd>
            </div>
            <div>
              <dt>Department</dt>
              <dd>{selected.department}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{selected.email}</dd>
            </div>
            <div>
              <dt>Site</dt>
              <dd>{selected.site}</dd>
            </div>
            <div>
              <dt>Shift (Asia/Kolkata)</dt>
              <dd>{selected.shift}</dd>
            </div>
            <div>
              <dt>Attendance</dt>
              <dd>
                <StatusBadge>{selected.status}</StatusBadge>
              </dd>
            </div>
          </dl>
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Close
          </Button>
        </Modal>
      )}
    </>
  );
}
