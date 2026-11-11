import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import Card from '../components/common/Card';
import Brand from '../components/common/Brand';
import { ErrorState, LoadingState } from '../components/common/States';
import useRemoteData from '../hooks/useRemoteData';
import usePageMeta from '../hooks/usePageMeta';
import { loadQrAttendanceAccess } from '../services/attendanceService';
import PunchCard from '../features/attendance/PunchCard';

export default function QrAttendancePage() {
  usePageMeta('Employee attendance', 'Record attendance with your personal employee QR.', true);
  const { hash } = useLocation();
  const token = hash.startsWith('#employee-qr=') ? hash.slice(13) : '';
  const loader = useCallback(() => {
    if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(token))
      throw new Error('Scan your personal employee QR. Ask HR for a replacement if needed.');
    return loadQrAttendanceAccess(token);
  }, [token]);
  const state = useRemoteData(loader);
  return (
    <main className="container section" id="main-content">
      <Brand />
      <h1>Employee attendance</h1>
      <p>No sign-in needed. This QR can only record attendance for its assigned employee.</p>
      {state.loading && <LoadingState label="Checking your employee QR…" />}
      {state.error && (
        <Card>
          <ErrorState
            title="Attendance QR unavailable"
            description={state.error}
            onRetry={state.reload}
          />
        </Card>
      )}
      {state.data && (
        <>
          <h2>{state.data.display_name}</h2>
          <PunchCard
            key={token}
            workspace={state.data}
            qrToken={token}
            qrAccess
            onRefresh={state.reload}
            onRecorded={state.reload}
          />
        </>
      )}
    </main>
  );
}
