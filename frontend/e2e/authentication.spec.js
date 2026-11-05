// Real Supabase JS SDK against intercepted HTTP contracts, not a live Supabase login.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const userId = '00000000-0000-4000-8000-000000000001';
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'browser-test@example.invalid',
  email_confirmed_at: '2026-11-05T00:00:00Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { role: 'hr' }, // Deliberately untrusted: the database assigns employee.
  created_at: '2026-11-05T00:00:00Z',
};
const membership = {
  user_id: userId,
  organization_id: '10000000-0000-4000-8000-000000000001',
  organization_name: 'Browser test organization',
  display_name: 'Verified Browser User',
  role: 'employee',
  employee_id: null,
  team_ids: [],
  site_ids: [],
};

async function interceptAuth(page, { invalidPassword = false, access = { allowed: true } } = {}) {
  const encode = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: userId, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fixture-signature`;
  let workspaceRequests = 0;
  await page.route('https://auth.snr-nest.test/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      'Access-Control-Allow-Origin': 'http://127.0.0.1:5174',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/auth/v1/token') {
      if (invalidPassword)
        return route.fulfill({
          status: 400,
          headers,
          json: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
        });
      return route.fulfill({
        headers,
        json: {
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          refresh_token: 'fixture-refresh-token',
          user,
        },
      });
    }
    if (path === '/auth/v1/user') return route.fulfill({ headers, json: user });
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers });
    if (path === '/rest/v1/rpc/current_workspace') {
      workspaceRequests++;
      expect(route.request().postDataJSON()).toEqual({});
      return access.allowed
        ? route.fulfill({ headers, json: membership })
        : route.fulfill({
            status: 403,
            headers,
            json: { code: 'PT403', message: 'workspace_not_assigned' },
          });
    }
    throw new Error(`Unexpected Auth SDK request: ${path}`);
  });
  return () => workspaceRequests;
}

async function signIn(page) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('the SDK signs in, restores on reload, respects the database role and signs out', async ({
  page,
}) => {
  const requests = await interceptAuth(page);
  await signIn(page);
  await expect(page).toHaveURL(/\/me$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome, Verified Browser User.' }),
  ).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Employee navigation' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'HR / Admin navigation' })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('snr-nest-auth'))).toContain(
    'fixture-refresh-token',
  );
  expect(await page.evaluate(() => localStorage.getItem('snr-nest-auth'))).toBeNull();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Verified Browser User.' }),
  ).toBeVisible();
  expect(requests()).toBeGreaterThanOrEqual(2);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('snr-nest-auth'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
});

test('a database revocation blocks a restored Auth session', async ({ page }) => {
  const access = { allowed: true };
  await interceptAuth(page, { access });
  await signIn(page);
  await expect(page).toHaveURL(/\/me$/);
  access.allowed = false;
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('snr-nest-auth'))).toBeNull();
});

test('incorrect credentials never request membership or open a workspace', async ({ page }) => {
  const requests = await interceptAuth(page, { invalidPassword: true });
  await signIn(page);
  await expect(page.getByRole('alert')).toHaveText(/Check your email and password/);
  await expect(page).toHaveURL(/\/login$/);
  expect(requests()).toBe(0);
});
