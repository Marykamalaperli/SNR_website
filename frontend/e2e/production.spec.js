import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';

test('production excludes preview routes, fixtures, and workspace shortcuts', async ({ page }) => {
  for (const path of ['/preview/me', '/preview/team', '/preview/hr']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Let’s get you back.' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
  }
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Development previews' })).toHaveCount(0);
  const assets = await readdir('dist/assets');
  const bundle = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith('.js'))
        .map((name) => readFile(`dist/assets/${name}`, 'utf8')),
    )
  ).join('');
  expect(bundle).not.toContain('alex@example.invalid');
  expect(bundle).not.toContain('Kavya Nair');
  expect(bundle).not.toContain('CR-104');
  expect(bundle).not.toContain('/preview/me');
});

test('direct refreshes of private routes require sign-in', async ({ page }) => {
  for (const path of ['/me', '/team/attendance', '/hr/approvals']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Good to see you.' })).toBeVisible();
  }
});
