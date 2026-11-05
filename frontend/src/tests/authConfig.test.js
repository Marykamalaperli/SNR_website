import { describe, expect, it } from 'vitest';
import { readPublicAuthConfig } from '../../scripts/public-auth-config.mjs';
import { createAuthStorage } from '../lib/authStorage';

const environment = {
  VITE_SUPABASE_URL: 'https://project.example.org',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_public_value',
};
const legacyKey = (role) => `e30.${btoa(JSON.stringify({ role }))}.test-signature`;

describe('Public authentication configuration', () => {
  it('allows an unconfigured public site and defaults to Supabase authorization', () => {
    expect(readPublicAuthConfig({})).toMatchObject({
      sessionSource: 'supabase',
      supabaseUrl: '',
      supabaseKey: '',
    });
    expect(readPublicAuthConfig(environment, { production: true })).toMatchObject({
      sessionSource: 'supabase',
    });
  });
  it('accepts a legacy public anon key without treating it as user authorization', () => {
    expect(
      readPublicAuthConfig({ ...environment, VITE_SUPABASE_PUBLISHABLE_KEY: legacyKey('anon') })
        .supabaseKey,
    ).toBe(legacyKey('anon'));
  });
  it.each(['sb_secret_private_sentinel', legacyKey('service_role'), 'not-a-public-key'])(
    'rejects a nonpublic key without including its value in errors',
    (key) => {
      let error;
      try {
        readPublicAuthConfig({ ...environment, VITE_SUPABASE_PUBLISHABLE_KEY: key });
      } catch (caught) {
        error = caught;
      }
      expect(error?.message).toContain('Secret/service-role keys are prohibited');
      expect(error.message).not.toContain(key);
    },
  );
  it.each([
    { VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL },
    { VITE_SUPABASE_PUBLISHABLE_KEY: environment.VITE_SUPABASE_PUBLISHABLE_KEY },
    { ...environment, VITE_SUPABASE_URL: 'http://project.example.org' },
    { ...environment, VITE_SUPABASE_URL: 'https://user:private-value@project.example.org' },
    { ...environment, VITE_SUPABASE_URL: 'https://project.example.org/rest/v1' },
    { ...environment, VITE_AUTH_SESSION_SOURCE: 'browser-role' },
    { ...environment, VITE_AUTH_SESSION_SOURCE: 'api', VITE_API_BASE_URL: 'http://localhost:8000' },
  ])('rejects incomplete or insecure production configuration', (settings) => {
    expect(() => readPublicAuthConfig(settings, { production: true })).toThrow();
  });
});

it('supports tab persistence and preserves unrelated storage keys', () => {
  const map = new Map([['unrelated-key', 'preserve']]);
  const storage = createAuthStorage(() => ({
    getItem: (key) => map.get(key),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  }));
  storage.setItem('test-auth', 'session');
  expect(storage.getItem('test-auth')).toBe('session');
  storage.removeItem('test-auth');
  expect(storage.getItem('test-auth')).toBeNull();
  expect(map.get('unrelated-key')).toBe('preserve');
});

it('keeps a removable memory session when browser storage is disabled', () => {
  const storage = createAuthStorage(() => {
    throw new Error('Storage disabled');
  });
  storage.setItem('test-auth', 'session');
  expect(storage.getItem('test-auth')).toBe('session');
  storage.removeItem('test-auth');
  expect(storage.getItem('test-auth')).toBeNull();
});
