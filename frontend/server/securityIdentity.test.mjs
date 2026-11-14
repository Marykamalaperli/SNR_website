import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { handleSecurityIdentity } from './securityIdentity.js';
const url = new URL('https://workspace.snr-nest.test');
const user = '91000000-0000-4000-8000-000000000001';
const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = publicKey.export({ format: 'jwk' });
const cose = isoCBOR.encode(
  new Map([
    [1, 2],
    [3, -7],
    [-1, 1],
    [-2, new Uint8Array(Buffer.from(jwk.x, 'base64url'))],
    [-3, new Uint8Array(Buffer.from(jwk.y, 'base64url'))],
  ]),
);
const credentialId = randomBytes(32).toString('base64url');
const credential = {
  id: credentialId,
  public_key: Buffer.from(cose).toString('base64url'),
  counter: 0,
  rp_id: url.hostname,
  transports: ['internal'],
};
const nonce = randomBytes(32).toString('base64url');
const hash = (bytes) => createHash('sha256').update(bytes).digest();
function context(kind = 'punch') {
  const calls = [];
  return {
    calls,
    rpc: async (name, data, opts) => {
      calls.push({ name, data, opts });
      if (['security_identity_context', 'security_station_context'].includes(name))
        return { user_id: user, display_name: 'Test Employee', credential };
      if (['security_begin_identity', 'security_begin_station_identity'].includes(name))
        return {
          id: 'challenge',
          challenge: nonce,
          expires_at: new Date(Date.now() + 120000).toISOString(),
        };
      if (['security_identity_challenge', 'security_station_identity_challenge'].includes(name))
        return {
          user_id: user,
          id: 'challenge',
          kind,
          challenge: nonce,
          rp_id: url.hostname,
          credential,
        };
      if (['complete_security_identity', 'complete_security_station_identity'].includes(name))
        return { id: data.p_id, status: kind === 'register' ? 'pending_hr_approval' : 'verified' };
      throw new Error('Unexpected identity RPC');
    },
  };
}
function assertion({
  challenge = nonce,
  origin = url.origin,
  flags = 5,
  key = privateKey,
  counter = 1,
} = {}) {
  const client = Buffer.from(
    JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }),
  );
  const number = Buffer.alloc(4);
  number.writeUInt32BE(counter);
  const auth = Buffer.concat([hash(url.hostname), Buffer.from([flags]), number]);
  return {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: client.toString('base64url'),
      authenticatorData: auth.toString('base64url'),
      signature: sign('sha256', Buffer.concat([auth, hash(client)]), key).toString('base64url'),
    },
  };
}
test('WebAuthn assertions verify a real signature, RP, origin, nonce and required user verification', async () => {
  const good = context();
  const result = await handleSecurityIdentity('assert-verify', {
    body: { flowId: 'flow', challengeId: 'challenge', response: assertion() },
    rpc: good.rpc,
    url,
    userId: user,
  });
  assert.equal(result.status, 'verified');
  const finish = good.calls.at(-1);
  assert.equal(finish.name, 'complete_security_identity');
  assert.equal(finish.opts.elevated, true);
  assert.equal(finish.data.p_counter, 1);
  assert.equal(finish.data.p_user_id, user);
  for (const response of [
    assertion({ origin: 'https://phishing.invalid' }),
    assertion({ challenge: 'forged' }),
    assertion({ flags: 1 }),
    assertion({ key: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey }),
  ]) {
    const denied = context();
    await assert.rejects(
      handleSecurityIdentity('assert-verify', {
        body: { flowId: 'flow', challengeId: 'challenge', response },
        rpc: denied.rpc,
        url,
        userId: user,
      }),
      /attendance_passkey_required/,
    );
    assert.equal(
      denied.calls.some((c) => c.name === 'complete_security_identity'),
      false,
    );
  }
});
test('supervised approval verifies the guard signature and binds the employee visit without changing normal enrollment authority', async () => {
  const ctx = context('station');
  const body = {
    flowId: 'guard-flow',
    visitId: 'employee-visit',
    action: { type: 'clock_in', employeeId: 'employee', evidence: { photo: 'exact-photo' } },
  };
  const options = await handleSecurityIdentity('station-options', {
    body,
    rpc: ctx.rpc,
    url,
    userId: user,
  });
  assert.equal(options.options.userVerification, 'required');
  assert.equal(options.options.challenge, nonce);
  assert.equal(ctx.calls.at(-1).name, 'security_begin_station_identity');
  assert.equal(ctx.calls.at(-1).data.p_visit_id, 'employee-visit');
  assert.deepEqual(ctx.calls.at(-1).data.p_action, body.action);
  const verified = await handleSecurityIdentity('station-verify', {
    body: { ...body, challengeId: 'challenge', response: assertion() },
    rpc: ctx.rpc,
    url,
    userId: user,
  });
  assert.equal(verified.status, 'verified');
  assert.equal(ctx.calls.at(-1).name, 'complete_security_station_identity');
  assert.deepEqual(ctx.calls.at(-1).data, { p_id: 'challenge', p_user_id: user, p_counter: 1 });
  assert.equal(ctx.calls.at(-1).opts.elevated, true);
  for (const response of [
    assertion({ origin: 'https://phishing.invalid' }),
    assertion({ flags: 1 }),
    assertion({ challenge: 'copied-challenge' }),
  ]) {
    const denied = context('station');
    await assert.rejects(
      handleSecurityIdentity('station-verify', {
        body: { ...body, challengeId: 'challenge', response },
        rpc: denied.rpc,
        url,
        userId: user,
      }),
      /attendance_passkey_required/,
    );
    assert.equal(
      denied.calls.some((c) => c.name === 'complete_security_station_identity'),
      false,
    );
  }
  await assert.rejects(
    handleSecurityIdentity('station-verify', {
      body: { ...body, challengeId: 'challenge', response: assertion() },
      rpc: context('punch').rpc,
      url,
      userId: user,
    }),
    /attendance_passkey_required/,
  );
});
test('registration requires user verification and finishes as pending HR approval, not attendance authority', async () => {
  const idBytes = Buffer.from(credentialId, 'base64url');
  const size = Buffer.alloc(2);
  size.writeUInt16BE(idBytes.length);
  const auth = Buffer.concat([
    hash(url.hostname),
    Buffer.from([69]),
    Buffer.alloc(4),
    Buffer.alloc(16),
    size,
    idBytes,
    cose,
  ]);
  const attestation = isoCBOR.encode(
    new Map([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', new Uint8Array(auth)],
    ]),
  );
  const response = {
    id: credentialId,
    rawId: credentialId,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({ type: 'webauthn.create', challenge: nonce, origin: url.origin }),
      ).toString('base64url'),
      attestationObject: Buffer.from(attestation).toString('base64url'),
      transports: ['internal'],
    },
  };
  const ctx = context('register');
  const result = await handleSecurityIdentity('register-verify', {
    body: { flowId: 'flow', challengeId: 'challenge', response },
    rpc: ctx.rpc,
    url,
    userId: user,
  });
  assert.equal(result.status, 'pending_hr_approval');
  const saved = ctx.calls.at(-1).data.p_registration;
  assert.equal(saved.id, credentialId);
  assert.equal(saved.public_key, credential.public_key);
});
test('identity options always require UV, bind the action in SQL and cannot switch subjects', async () => {
  const ctx = context();
  const action = { id: 'request', type: 'clock_in' };
  const options = await handleSecurityIdentity('assert-options', {
    body: { flowId: 'flow', action },
    rpc: ctx.rpc,
    url,
    userId: user,
  });
  assert.equal(options.options.userVerification, 'required');
  assert.equal(options.options.rpId, url.hostname);
  assert.deepEqual(ctx.calls.at(-1).data.p_action, action);
  assert.equal(options.options.challenge, nonce);
  assert.equal(Object.hasOwn(ctx.calls.at(-1).data, 'p_challenge'), false);
  await assert.rejects(
    handleSecurityIdentity('assert-options', {
      body: { flowId: 'flow', action },
      rpc: ctx.rpc,
      url,
      userId: 'another-user',
    }),
    /attendance_passkey_required/,
  );
});
