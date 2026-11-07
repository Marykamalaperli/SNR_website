import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: 'list',
  use: {
    browserName: 'chromium',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'attendance',
      testMatch: /attendance.spec.js/,
      use: { baseURL: 'http://127.0.0.1:5174' },
    },
    { name: 'accounts', testMatch: /accounts.spec.js/, use: { baseURL: 'http://127.0.0.1:5174' } },
    {
      name: 'workforce',
      testMatch: /workforce.spec.js/,
      use: { baseURL: 'http://127.0.0.1:5174' },
    },
    {
      name: 'authentication',
      testMatch: /authentication.spec.js/,
      use: { baseURL: 'http://127.0.0.1:5174' },
    },
    {
      name: 'development',
      testMatch: /development.spec.js/,
      use: { baseURL: 'http://127.0.0.1:5173' },
    },
    {
      name: 'production',
      testMatch: /production.spec.js/,
      use: { baseURL: 'http://127.0.0.1:4173' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_SUPABASE_URL: 'https://auth.snr-nest.test',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_fixture',
        VITE_AUTH_SESSION_SOURCE: 'supabase',
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
