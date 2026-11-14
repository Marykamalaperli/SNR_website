import { startAuthentication } from '@simplewebauthn/browser';
import { config } from '../lib/config';
import { confirmSession } from './authService';
import {
  attendanceRpc,
  attendanceGatewayRequest,
  attendanceActionPayload,
} from './attendanceService';

// Separate, memory-only Auth client. It must never replace the guard's session
// or use sessionStorage/localStorage on a phone shared by several employees.
export async function signInStationEmployee(email, password) {
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'snr-station-' + crypto.randomUUID(),
    },
    global: {
      fetch: (input, options = {}) =>
        fetch(input, {
          ...options,
          signal: options.signal
            ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
            : AbortSignal.timeout(10000),
        }),
    },
  });
  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session)
      throw new Error('Check your employee email and password and try again.');
    const session = await confirmSession(data.session.access_token, client);
    if (session.role !== 'employee')
      throw new Error('Use the Employee account of the person standing at the station.');
    return { client, session };
  } catch (failure) {
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
    throw failure;
  }
}
export const loadStationContext = (flowId) =>
  attendanceRpc('security_station_context', { p_flow_id: flowId });
export const loadStationDue = (flowId) =>
  attendanceRpc('security_station_due', { p_flow_id: flowId });
export const closeStationVisit = (flowId, visitId) =>
  attendanceRpc('security_station_close', { p_flow_id: flowId, p_visit_id: visitId });
export const manageStationOperator = (employeeId, values = {}) =>
  attendanceRpc('hr_attendance_station', {
    p_employee_id: employeeId,
    p_enabled: values.enabled ?? null,
    p_version: values.version ?? null,
  });
export async function openStationVisit(flowId, employeeClient, clientId) {
  const { data } = await employeeClient.auth.getSession();
  if (!data?.session?.access_token) throw new Error('The employee must sign in again.');
  return attendanceGatewayRequest(
    'station/workspace',
    { flowId, clientId },
    {
      headers: { 'X-Employee-Authorization': 'Bearer ' + data.session.access_token },
    },
  );
}
export function stationTransport(employeeClient, guardFlowId, visitId) {
  return {
    validateLocation: (action, location) =>
      attendanceGatewayRequest(
        'security/location',
        {
          flowId: action.securityFlowId,
          employeeId: action.employeeId,
          type: action.type,
          previousId: action.previousId || null,
          location,
        },
        { client: employeeClient },
      ),
    verifyIdentity: async (_flowId, action) => {
      try {
        const challenge = await attendanceGatewayRequest('identity/station-options', {
          flowId: guardFlowId,
          visitId,
          action: attendanceActionPayload(action),
        });
        const response = await startAuthentication({ optionsJSON: challenge.options });
        const result = await attendanceGatewayRequest('identity/station-verify', {
          flowId: guardFlowId,
          visitId,
          challengeId: challenge.id,
          response,
        });
        return result.id;
      } catch (failure) {
        if (failure.name === 'NotAllowedError' || failure.code === 'ERROR_CEREMONY_ABORTED')
          throw new Error(
            'The guard’s passkey confirmation was cancelled. No attendance was confirmed.',
            { cause: failure },
          );
        throw failure;
      }
    },
    record: (action) =>
      attendanceGatewayRequest(
        'security/photos',
        {
          ...attendanceActionPayload(action),
          flowId: action.securityFlowId,
          identityId: action.identityId,
        },
        { client: employeeClient },
      ),
    loadChecks: (flowId) =>
      attendanceRpc('security_presence_status', { p_flow_id: flowId }, employeeClient),
    recordCheck: (action) =>
      attendanceGatewayRequest(
        'security/check-photos',
        {
          ...attendanceActionPayload(action),
          flowId: action.securityFlowId,
          identityId: action.identityId,
        },
        { client: employeeClient },
      ),
  };
}
