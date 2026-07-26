import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

/**
 * Escape hatch for environments that ship a pre-provisioned Chromium whose build
 * number does not match this Playwright release (sandboxes, locked-down CI).
 * Unset everywhere else, so the normal `playwright install` browsers are used.
 */
const executablePath = process.env['CHROMIUM_PATH'];
const browser = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...browser } },
    // The app is mobile-first, so the mobile viewport is a first-class target.
    { name: 'mobile', use: { ...devices['Pixel 7'], ...browser } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
