import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

/** Optional pinned Chromium (e.g. PLAYWRIGHT_BROWSERS_PATH). Omit when missing so @playwright/test uses its bundled browser. */
function resolveChromiumExecutable(): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const fallback = path.join(
    process.cwd(),
    '.playwright-browsers/chromium-1208/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  );
  if (fs.existsSync(fallback)) return fallback;
  return undefined;
}

const chromiumExecutablePath = resolveChromiumExecutable();

/** Default headless (CI-friendly). Run headed locally: `PLAYWRIGHT_HEADED=1 npx playwright test`. */
const headless = process.env.PLAYWRIGHT_HEADED === '1' ? false : true;

const launchOptions = chromiumExecutablePath
  ? { executablePath: chromiumExecutablePath }
  : {};

/**
 * Product-style E2E defaults:
 * - Strict timeouts, retries in CI, traces on retry
 * - Optional webServer (Vite) unless PLAYWRIGHT_SKIP_WEBSERVER=1
 * - Global auth: tests/auth.setup.ts → playwright/.auth/user.json
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
    headless,
    launchOptions,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video needs ffmpeg; keep off unless PLAYWRIGHT_VIDEO=1 (run `playwright install` for full deps).
    video: process.env.PLAYWRIGHT_VIDEO === '1' ? 'retain-on-failure' : 'off',
  },
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
    ? {}
    : {
        webServer:
          process.env.PLAYWRIGHT_START_API === '1'
            ? [
                {
                  command: 'npm run dev',
                  url: baseURL,
                  reuseExistingServer: true,
                  timeout: 120_000,
                },
                {
                  command: 'npm run server',
                  url: 'http://localhost:5179/api/health',
                  reuseExistingServer: true,
                  timeout: 90_000,
                },
              ]
            : {
                command: 'npm run dev',
                url: baseURL,
                reuseExistingServer: true,
                timeout: 120_000,
              },
      }),
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
