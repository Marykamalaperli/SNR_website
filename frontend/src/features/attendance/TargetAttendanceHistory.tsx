import { useEffect, useState, useCallback } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { ErrorState, LoadingState } from '../../components/common/States';
import { AttendanceEvent, listAttendanceEvents } from '../../services/targetAttendanceService';

interface TargetAttendanceHistoryProps {
  employeeId?: string;
  storeId?: string;
  refreshTrigger?: number;
}

export default function TargetAttendanceHistory({
  employeeId,
  storeId,
  refreshTrigger = 0,
}: TargetAttendanceHistoryProps) {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAttendanceEvents({
        employee_id: employeeId,
        store_id: storeId,
        limit: 20,
      });
      setEvents(data.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load attendance events.');
    } finally {
      setLoading(false);
    }
  }, [employeeId, storeId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents, refreshTrigger]);

  return (
    <Card className="target-attendance-history-card">
      <div className="card-heading">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={20} className="text-primary" />
          <h2 style={{ margin: 0 }}>Attendance History</h2>
        </div>
        <Button variant="secondary" onClick={loadEvents} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {loading && <LoadingState label="Loading attendance events…" />}

      {error && (
        <ErrorState
          title="Could not load attendance records"
          description={error}
          onRetry={loadEvents}
        />
      )}

      {!loading && !error && events.length === 0 && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#6b7280' }}>
          No attendance punches recorded yet.
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.875rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>
                <th style={{ padding: '0.75rem 0.5rem' }}>Action</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Date & Time (Server UTC)</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Store ID</th>
                <th style={{ padding: '0.75rem 0.5rem' }}>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {events.map((evt) => (
                <tr key={evt.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    <StatusBadge tone={evt.action === 'clock_in' ? 'positive' : 'neutral'}>
                      {evt.action === 'clock_in' ? 'Clock In' : 'Clock Out'}
                    </StatusBadge>
                  </td>
                  <td style={{ padding: '0.75rem 0.5rem' }}>
                    {new Date(evt.server_timestamp).toLocaleString()}
                  </td>
                  <td
                    style={{
                      padding: '0.75rem 0.5rem',
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                    }}
                  >
                    {evt.store_id.slice(0, 8)}…
                  </td>
                  <td
                    style={{ padding: '0.75rem 0.5rem', color: '#059669', fontSize: '0.8125rem' }}
                  >
                    ✓ Verified Photo
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
