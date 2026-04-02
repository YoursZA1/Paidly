/**
 * Scoped Playwright config: admin affiliate decline E2E (starts Vite + Node API by default).
 *
 *   cp playwright/env.e2e.example .env.e2e   # fill secrets; .env.e2e is gitignored
 *   npm run test:e2e:admin-affiliate
 *
 * Or export vars in the shell (they override .env.e2e). See tests/admin-affiliate-e2e.spec.ts.
 */
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const repoRoot = process.cwd();
const envE2ePath = path.join(repoRoot, '.env.e2e');
if (fs.existsSync(envE2ePath)) {
  dotenv.config({ path: envE2ePath });
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

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
const headless = process.env.PLAYWRIGHT_HEADED === '1' ? false : true;
const launchOptions = chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {};

export default defineConfig({
  testDir: './tests',
  testMatch: '**/admin-affiliate-e2e.spec.ts',
  testIgnore: ['**/unit/**', '**/*.test.{js,jsx,ts,tsx}'],
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
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
    video: process.env.PLAYWRIGHT_VIDEO === '1' ? 'retain-on-failure' : 'off',
    storageState: { cookies: [], origins: [] },
  },
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'
    ? {}
    : {
        webServer: [
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
        ],
      }),
  projects: [
    {
      name: 'chromium-admin-affiliate',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'playwright/test-results',
});
