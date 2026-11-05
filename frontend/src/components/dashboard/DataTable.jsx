import { EmptyState } from '../common/States';

export default function DataTable({
  caption,
  columns,
  rows,
  rowKey = 'id',
  emptyTitle = 'No matching records',
  emptyDescription,
}) {
  if (!rows.length)
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription || 'Try changing your search or filters.'}
      />
    );
  return (
    <div className="table-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
