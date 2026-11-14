import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import {
  attendanceGatewayRequest,
  attendanceRpc,
  attendanceActionPayload,
} from './attendanceService';

export const loadSecurityWorkspace = (clientId) =>
  attendanceGatewayRequest('security/workspace', { clientId });
export const releaseSecurityFlow = (flowId) =>
  attendanceRpc('security_release_flow', { p_flow_id: flowId });
export const loadSecurityChecks = (flowId) =>
  attendanceRpc('security_presence_status', { p_flow_id: flowId });
export const manageEmployeeSecurity = (employeeId, values = {}) =>
  attendanceRpc('hr_security_attendance', {
    p_employee_id: employeeId,
    p_checks: values.checks ?? null,
    p_credential_id: values.credentialId || null,
    p_version: values.version || null,
    p_reset: values.reset || false,
  });
export const loadSecurityReport = (from, to) =>
  attendanceRpc('hr_security_presence_report', { p_from: from, p_to: to });
export async function enrollAttendancePasskey(flowId) {
  try {
    const challenge = await attendanceGatewayRequest('identity/register-options', { flowId });
    const response = await startRegistration({ optionsJSON: challenge.options });
    return await attendanceGatewayRequest('identity/register-verify', {
      flowId,
      challengeId: challenge.id,
      response,
    });
  } catch (failure) {
    if (failure.name === 'NotAllowedError' || failure.code === 'ERROR_CEREMONY_ABORTED')
      throw new Error('Passkey setup was cancelled or timed out. Try again when you are ready.', {
        cause: failure,
      });
    throw failure;
  }
}
export async function verifyAttendanceIdentity(flowId, action) {
  try {
    const challenge = await attendanceGatewayRequest('identity/assert-options', {
      flowId,
      action: attendanceActionPayload(action),
    });
    const response = await startAuthentication({ optionsJSON: challenge.options });
    const result = await attendanceGatewayRequest('identity/assert-verify', {
      flowId,
      challengeId: challenge.id,
      response,
    });
    return result.id;
  } catch (failure) {
    if (failure.name === 'NotAllowedError' || failure.code === 'ERROR_CEREMONY_ABORTED')
      throw new Error(
        'Identity verification was cancelled or timed out. No new attendance was confirmed.',
        { cause: failure },
      );
    throw failure;
  }
}
export const recordSecurityCheck = (action) =>
  attendanceGatewayRequest('security/check-photos', {
    ...attendanceActionPayload(action),
    flowId: action.securityFlowId,
    identityId: action.identityId,
  });

export async function openSecurityPhoto(id) {
  const photo = await attendanceRpc('security_presence_details', { p_id: id });
  if (photo.bucket_id !== 'attendance-security-checks')
    throw new Error('Invalid security photo bucket.');
  const { getAuthClient } = await import('./authService');
  const client = await getAuthClient();
  const { data, error } = await client.storage
    .from(photo.bucket_id)
    .createSignedUrl(photo.object_path, 60);
  if (error || !data?.signedUrl)
    throw new Error('This private photo could not be opened. Try again.');
  return { ...photo, signed_url: data.signedUrl };
}
