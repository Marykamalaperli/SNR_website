import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';

export default function AttendanceTable({ records }) {
  return (
    <DataTable
      caption="Recent attendance records"
      rows={records}
      columns={[
        {
          key: 'date',
          label: 'Date',
          render: (row) => (
            <span className="table-date">
              <strong>{row.date}</strong>
              <small>{row.day}</small>
            </span>
          ),
        },
        { key: 'clockIn', label: 'Clock in' },
        { key: 'clockOut', label: 'Clock out' },
        {
          key: 'status',
          label: 'Status',
          render: (row) => <StatusBadge>{row.status}</StatusBadge>,
        },
      ]}
    />
  );
}
