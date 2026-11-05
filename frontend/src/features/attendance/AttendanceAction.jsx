import { Clock3, LogIn, LogOut, Check, Sun } from 'lucide-react';
import Button from '../../components/common/Button';
import StatusBadge from '../../components/common/StatusBadge';
import { useWorkspace } from '../../hooks/useWorkspace';

export default function AttendanceAction() {
  const { data, dispatch, dateLabel } = useWorkspace();
  const { clock } = data;
  const completed = clock.status === 'Clocked out';
  return (
    <section className="attendance-action" aria-labelledby="attendance-action-title">
      <div className="attendance-action-top">
        <span className="eyebrow">
          <Sun size={15} /> TODAY’S ATTENDANCE
        </span>
        <StatusBadge>{clock.status}</StatusBadge>
      </div>
      <h2 id="attendance-action-title">
        {completed
          ? 'A good day, wrapped up.'
          : clock.status === 'Clocked in'
            ? 'You’re all set for the day.'
            : 'Ready when you are.'}
      </h2>
      <p>
        {completed
          ? 'Your sample attendance is complete. See you next shift.'
          : 'A fresh start. Take a moment, then make it a good one.'}
      </p>
      <div className="attendance-times">
        <div>
          <span>Clock in</span>
          <strong>{clock.clockIn}</strong>
        </div>
        <span className="time-divider" />
        <div>
          <span>Clock out</span>
          <strong>{clock.clockOut}</strong>
        </div>
      </div>
      <div className="attendance-action-bottom">
        <span>
          <Clock3 size={16} />
          {dateLabel.split(',')[0]} · General shift
        </span>
        <Button onClick={() => dispatch({ type: 'punch' })} disabled={completed}>
          {completed ? (
            <Check size={18} />
          ) : clock.status === 'Clocked in' ? (
            <LogOut size={18} />
          ) : (
            <LogIn size={18} />
          )}
          {completed ? 'Day complete' : clock.status === 'Clocked in' ? 'Clock Out' : 'Clock In'}
        </Button>
      </div>
    </section>
  );
}
