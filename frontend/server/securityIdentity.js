import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const encode = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
const decode = (value) =>
  Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));
export async function handleSecurityIdentity(operation, { body, rpc, url, userId }) {
  const failure = () =>
    Object.assign(new Error('attendance_passkey_required'), {
      securityCode: 'attendance_passkey_required',
    });
  if (!body?.flowId) throw failure();
  const ctx = await rpc('security_identity_context', { p_flow_id: body.flowId });
  if (ctx.user_id !== userId) throw failure();
  if (operation.endsWith('-options')) {
    const registering = operation === 'register-options';
    if (!registering && (!ctx.credential || ctx.credential.rp_id !== url.hostname)) throw failure();
    const options = registering
      ? await generateRegistrationOptions({
          rpName: 'SNR NEST attendance',
          rpID: url.hostname,
          userID: new TextEncoder().encode(userId),
          userName: ctx.display_name,
          userDisplayName: ctx.display_name,
          timeout: 120000,
          attestationType: 'none',
          supportedAlgorithmIDs: [-7, -257],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            residentKey: 'preferred',
            userVerification: 'required',
          },
        })
      : await generateAuthenticationOptions({
          rpID: url.hostname,
          timeout: 120000,
          userVerification: 'required',
          allowCredentials: [{ id: ctx.credential.id, transports: ctx.credential.transports }],
        });
    const challenge = await rpc('security_begin_identity', {
      p_flow_id: body.flowId,
      p_kind: registering ? 'register' : body.action?.type === 'security_check' ? 'check' : 'punch',
      p_rp_id: url.hostname,
      p_action: registering ? null : body.action,
    });
    options.challenge = challenge.challenge;
    return { ...challenge, options };
  }
  const challenge = await rpc('security_identity_challenge', {
    p_flow_id: body.flowId,
    p_id: body.challengeId,
  });
  if (challenge.user_id !== userId || challenge.rp_id !== url.hostname) throw failure();
  let registration = null,
    counter = null;
  try {
    if (operation === 'register-verify') {
      if (challenge.kind !== 'register') throw failure();
      const result = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: url.hostname,
        requireUserVerification: true,
        supportedAlgorithmIDs: [-7, -257],
      });
      if (!result.verified || !result.registrationInfo?.userVerified) throw failure();
      const credential = result.registrationInfo.credential;
      registration = {
        id: credential.id,
        public_key: encode(credential.publicKey),
        counter: credential.counter,
        transports: (credential.transports || []).filter((t) =>
          ['internal', 'hybrid', 'usb', 'nfc', 'ble'].includes(t),
        ),
      };
    } else {
      if (!['punch', 'check'].includes(challenge.kind) || !challenge.credential) throw failure();
      const result = await verifyAuthenticationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: url.origin,
        expectedRPID: url.hostname,
        requireUserVerification: true,
        credential: {
          id: challenge.credential.id,
          publicKey: decode(challenge.credential.public_key),
          counter: Number(challenge.credential.counter),
          transports: challenge.credential.transports,
        },
      });
      if (!result.verified || !result.authenticationInfo.userVerified) throw failure();
      counter = result.authenticationInfo.newCounter;
    }
  } catch {
    throw failure();
  }
  return rpc(
    'complete_security_identity',
    { p_id: challenge.id, p_user_id: userId, p_registration: registration, p_counter: counter },
    { elevated: true },
  );
}
