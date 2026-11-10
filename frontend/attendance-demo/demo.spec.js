import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { capturePunch, installAttendanceCamera } from '../e2e/helpers/attendanceCamera';
import { DEMO_SITE_ID, INITIAL_SITE } from './model';

async function startSample(page, scenario = 'inside') {
  await page.goto('/');
  await page.getByLabel('Sample scenario').selectOption(scenario);
  await page.getByRole('checkbox', { name: /I understand/ }).check();
  await page.getByRole('button', { name: 'Clock in', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate QR scan' }).click();
  if (scenario !== 'wrong-qr') {
    await page.getByRole('button', { name: 'Use sample photo' }).click();
    await page.getByRole('button', { name: 'Confirm sample clock-in' }).click();
  }
}

test('guided clock-in/out records evidence in this tab and resets on reload', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await startSample(page);
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recorded evidence', exact: true }).click();
  await expect(page.getByAltText('Demo clock-in photo')).toBeVisible();
  await page.getByRole('button', { name: 'Employee attendance', exact: true }).click();
  await page.getByRole('checkbox', { name: /I understand/ }).check();
  await page.getByRole('button', { name: 'Clock out', exact: true }).click();
  await page.getByRole('button', { name: 'Simulate QR scan' }).click();
  await page.getByRole('button', { name: 'Use sample photo' }).click();
  await page.getByRole('button', { name: 'Confirm sample clock-out' }).click();
  await page.getByRole('button', { name: 'Recorded evidence', exact: true }).click();
  await expect(page.getByAltText('Demo clock-out photo')).toBeVisible();
  expect(
    requests.every((url) => url.startsWith('http://127.0.0.1:4181/') || url.startsWith('data:')),
  ).toBe(true);
  await page.reload();
  await page.getByRole('button', { name: 'Recorded evidence', exact: true }).click();
  await expect(page.getByText('Your first record starts here.')).toBeVisible();
});
for (const [scenario, error] of [
  ['outside', 'Outside the store area'],
  ['inaccurate', 'accuracy is too low'],
  ['wrong-qr', 'does not match your store'],
]) {
  test('rejects the ' + scenario + ' sample without an attendance record', async ({ page }) => {
    await startSample(page, scenario);
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(error);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Recorded evidence', exact: true }).click();
    await expect(page.getByText('Your first record starts here.')).toBeVisible();
  });
}

test('site setup and QR download are usable on desktop and mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sites & Shifts', exact: true }).click();
  await page.getByLabel('Site name').fill('Sample review store');
  await page.getByLabel('Allowed radius (metres)').fill('150');
  await page.getByRole('button', { name: 'Save demo site' }).click();
  await expect(page.getByRole('status')).toContainText('Demo site saved');
  await expect(page.getByRole('link', { name: 'Download demo QR' })).toHaveAttribute(
    'download',
    'snr-attendance-demo-qr.png',
  );
  await page.getByRole('button', { name: 'Employee attendance', exact: true }).click();
  await expect(page.getByText('Sample review store', { exact: true })).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: '/tmp/snr-live-demo-' + width + '.png', fullPage: true });
  }
});

test('uses the real QR decoder, camera capture and geolocation without contacting an API', async ({
  page,
  context,
}) => {
  await installAttendanceCamera(page, DEMO_SITE_ID);
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({
    latitude: INITIAL_SITE.latitude,
    longitude: INITIAL_SITE.longitude,
    accuracy: 8,
  });
  const remote = [];
  page.on('request', (request) => {
    if (/supabase|\/rpc\/|\/api\//.test(request.url())) remote.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use my camera & location', exact: true }).click();
  await page.getByRole('checkbox', { name: /I agree/ }).check();
  await capturePunch(page, 'Clock in');
  await expect(page.getByRole('button', { name: 'Clock out', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Recorded evidence', exact: true }).click();
  await expect(page.getByAltText('Demo clock-in photo')).toBeVisible();
  expect(remote).toEqual([]);
  expect(await page.evaluate(() => window.attendanceCameraTracks)).toBe(0);
});
