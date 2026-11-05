import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`responsive views and navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 960 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of ['/', '/login', '/preview/me', '/preview/team', '/preview/hr']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${path.replaceAll('/', '-') || 'home'}-${width}.png`),
        fullPage: true,
      });
    }
    if (width < 1024) {
      await page.getByRole('button', { name: 'Open workspace navigation' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.getByRole('link', { name: 'Employees', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Employee directory', exact: true }),
      ).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [390, 1440]) {
  test(`automated WCAG checks at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    for (const path of ['/', '/login', '/preview/me', '/preview/team', '/preview/hr']) {
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(violations, `${path} at ${width}px`).toEqual([]);
    }
  });
}

test('mobile navigation and dialog preserve keyboard access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /^(Open|Close) navigation$/ });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.goto('/preview/me/corrections');
  const request = page.getByRole('button', { name: 'Request Correction' });
  await request.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(request).toBeFocused();
});

test('sample reviews and report download work in a real browser', async ({ page }) => {
  await page.goto('/preview/hr/approvals');
  await page.getByRole('button', { name: 'Review request CR-104' }).click();
  await page.getByLabel('Review note').fill('Sample evidence reviewed and confirmed.');
  await page.getByRole('button', { name: 'Approve Request' }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await page.goto('/preview/hr/reports');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Sample CSV' }).click();
  expect((await downloaded).suggestedFilename()).toBe('snr-nest-SAMPLE-attendance.csv');
});
