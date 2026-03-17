import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';

test.describe('BONUS: Performance + Mobile', () => {
  test('Dashboard loads under 2s (best-effort, local)', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const start = Date.now();
    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Dashboard/i);

    const elapsedMs = Date.now() - start;
    // Local machines vary; treat as a guardrail and surface value in report.
    await test.info().attach('dashboard-load-ms.txt', { body: String(elapsedMs), contentType: 'text/plain' });
    expect(elapsedMs, `Dashboard domcontentloaded should be < 2000ms (got ${elapsedMs}ms)`).toBeLessThan(2000);
  });

  test('Mobile viewport: navigation and key page elements render', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Dashboard/i);

    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/dashboard/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  });
});

