// Real WebAuthn ceremonies through Chromium's virtual authenticator. Only the
// application transport/database is intercepted; signatures and UV are verified.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoCBOR } from '@simplewebauthn/server/helpers';

export async function securityFixture(
  page,
  state,
  { role, userId, buildWorkspace, validateLocation, handlePhoto, seedCredential = true },
) {
  const rpId = 'localhost';
  const flowId = 'ab000000-0000-4000-8000-000000000001';
  const challenges = new Map(),
    proofs = new Map();
  let credential;
  state.securityApproved = seedCredential;
  state.securityPending = false;
  state.securityChecksPerShift = 0;
  state.securityCheck = null;
  state.securityCheckPhotos = [];
  const session = await page.context().newCDPSession(page);
  await session.send('WebAuthn.enable');
  const { authenticatorId } = await session.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  if (seedCredential) {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const id = randomBytes(32);
    const cose = isoCBOR.encode(
      new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
        [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
      ]),
    );
    credential = {
      id: id.toString('base64url'),
      publicKey: cose,
      counter: 0,
      transports: ['internal'],
    };
    await session.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId: id.toString('base64'),
        privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
        rpId,
        isResidentCredential: false,
        signCount: 0,
      },
    });
  }
  state.securityCredential = () => credential;
  const canonical = (value) =>
    JSON.stringify(value, (_, v) =>
      v && !Array.isArray(v) && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v,
    );
  await page.route('**/api/attendance/identity/*', async (route) => {
    const body = route.request().postDataJSON();
    const reply = (json, status = 200) => route.fulfill({ status, json });
    if (!route.request().headers().authorization || role !== 'employee')
      return reply({ error: { code: 'sign_in_required' } }, 401);
    const operation = new URL(route.request().url()).pathname.split('/').at(-1);
    if (
      operation.startsWith('station-') &&
      (!state.stationEnabled || body.visitId !== state.stationVisit?.id)
    )
      return reply({ error: { code: 'station_visit_required' } }, 403);
    if (operation.endsWith('-options')) {
      const register = operation === 'register-options';
      if (!register && !state.securityApproved)
        return reply({ error: { code: 'attendance_passkey_required' } }, 403);
      const options = register
        ? await generateRegistrationOptions({
            rpName: 'SNR NEST attendance',
            rpID: rpId,
            userName: 'Test employee',
            userID: new TextEncoder().encode(userId),
            attestationType: 'none',
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              residentKey: 'preferred',
              userVerification: 'required',
            },
            supportedAlgorithmIDs: [-7, -257],
          })
        : await generateAuthenticationOptions({
            rpID: rpId,
            userVerification: 'required',
            allowCredentials: [{ id: credential.id, transports: ['internal'] }],
          });
      const id = randomBytes(16).toString('hex');
      challenges.set(id, { options, action: body.action, register });
      return reply({ id, options, expires_at: new Date(Date.now() + 120000).toISOString() });
    }
    const challenge = challenges.get(body.challengeId);
    if (!challenge) return reply({ error: { code: 'attendance_identity_expired' } }, 409);
    try {
      if (challenge.register) {
        const result = await verifyRegistrationResponse({
          response: body.response,
          expectedChallenge: challenge.options.challenge,
          expectedOrigin: new URL(route.request().url()).origin,
          expectedRPID: rpId,
          requireUserVerification: true,
        });
        if (!result.verified) throw new Error('Not verified');
        credential = result.registrationInfo.credential;
        state.securityPending = true;
        state.securityApproved = false;
        return reply({ id: body.challengeId, status: 'pending_hr_approval' });
      }
      const result = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.options.challenge,
        expectedOrigin: new URL(route.request().url()).origin,
        expectedRPID: rpId,
        credential,
        requireUserVerification: true,
      });
      if (!result.verified) throw new Error('Not verified');
      credential.counter = result.authenticationInfo.newCounter;
      proofs.set(body.challengeId, canonical(challenge.action));
      challenges.delete(body.challengeId);
      return reply({ id: body.challengeId, status: 'verified' });
    } catch {
      return reply({ error: { code: 'attendance_passkey_required' } }, 403);
    }
  });
  await page.route('**/api/attendance/security/*', async (route) => {
    const body = route.request().postDataJSON();
    const reply = (json, status = 200) =>
      route.fulfill({ status, json, headers: { 'Cache-Control': 'no-store' } });
    if (!route.request().headers().authorization || role !== 'employee')
      return reply({ error: { code: 'sign_in_required' } }, 401);
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/workspace')) {
      if (state.securityClientId && state.securityClientId !== body.clientId)
        return reply({ error: { code: 'attendance_open_elsewhere' } }, 409);
      state.securityClientId = body.clientId;
      return reply({
        ...buildWorkspace(),
        security_flow_id: flowId,
        security_credential_approved: state.securityApproved,
        security_credential_pending: state.securityPending,
        security_checks_per_shift: state.securityChecksPerShift,
        display_name: state.people[0]?.display_name,
        server_time: new Date().toISOString(),
      });
    }
    const parameters = {
      p_event_type: body.type,
      p_request_id: body.id,
      p_previous_event_id: body.previousId,
      p_employee_id: body.employeeId,
      p_location: body.location,
      p_evidence: body.evidence,
    };
    const wrap = (json, status = 200) =>
      status >= 400 ? reply({ error: { code: json.message } }, status) : reply(json, status);
    if (
      (body.flowId !== flowId && body.flowId !== state.stationEmployeeFlow) ||
      body.employeeId !== state.people[0]?.id
    )
      return reply({ error: { code: 'security_flow_required' } }, 403);
    if (path.endsWith('/location')) {
      state.calls.push({
        name: 'validate_attendance_location',
        parameters: { ...parameters, p_flow_id: body.flowId },
      });
      return validateLocation(parameters, wrap);
    }
    const action = {
      type: body.type,
      id: body.id,
      previousId: body.previousId || null,
      employeeId: body.employeeId,
      location: body.location,
      evidence: body.evidence,
      ...(body.type === 'security_check' ? { checkId: body.checkId } : {}),
    };
    if (proofs.get(body.identityId) !== canonical(action) || !state.securityApproved)
      return reply({ error: { code: 'attendance_passkey_required' } }, 403);
    if (body.flowId === state.stationEmployeeFlow && !state.stationEnabled)
      return reply({ error: { code: 'station_operator_required' } }, 403);
    if (path.endsWith('/check-photos')) {
      const existing = state.securityCheckPhotos.find((p) => p.id === body.id);
      if (existing) return reply(existing);
      if (
        !state.securityCheck ||
        state.securityCheck.id !== body.checkId ||
        Date.parse(state.securityCheck.expires_at) <= Date.now()
      )
        return reply({ error: { code: 'security_check_expired' } }, 409);
      const receipt = {
        id: body.id,
        event_type: 'security_check',
        photo_saved: true,
        location_saved: true,
        occurred_at: new Date().toISOString(),
      };
      state.securityCheckPhotos.push(receipt);
      state.securityCheck = null;
      return reply(receipt);
    }
    state.calls.push({ name: 'record_attendance', parameters });
    return handlePhoto(route, parameters, (json, status = 200) =>
      wrap({ ...json, security_identity_verified: true }, status),
    );
  });
}
