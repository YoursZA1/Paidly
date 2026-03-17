import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  '.playwright-browsers/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

/**
 * Stability-focused config:
 * - 30s timeouts
 * - retries in CI
 * - trace/video/screenshot on failure
 * - HTML reporter
 * - global auth via a setup project + storageState
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**', '**/*.test.{js,jsx,ts,tsx}'],
  timeout: 30_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    headless: false,
    launchOptions: {
      executablePath: chromiumExecutablePath,
    },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-guest',
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
    },
    {
      name: 'chromium-mobile-guest',
      use: {
        ...devices['Pixel 7'],
        storageState: { cookies: [], origins: [] },
      },
    },
    {
      name: 'chromium-mobile',
      dependencies: ['setup'],
      use: {
        ...devices['Pixel 7'],
        storageState: 'playwright/.auth/user.json',
      },
    },
  ],
  outputDir: 'playwright/test-results',
});

