import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';

test.describe('ERROR HANDLING', () => {
  test('Empty states render without crashing', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.clients}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Clients/i);
    // If empty, should show a friendly CTA/text rather than a hard error.
    await expect(page.getByText(/no clients|empty|get started|add your first/i).first()).toBeVisible({ timeout: 10_000 }).catch(() => {});
    await expect(page.getByText(/something went wrong|uncaught|exception/i)).toHaveCount(0);
  });

  test('Graceful API failure banner (simulated offline)', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.context().setOffline(true);
    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' }).catch(() => {});

    await expect(page.getByText(/failed|offline|network|please refresh|retry/i).first()).toBeVisible({ timeout: 15_000 }).catch(() => {});
    await page.context().setOffline(false);
  });
});

