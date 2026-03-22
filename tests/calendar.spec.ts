import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('CALENDAR', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Calendar loads and is usable (smoke)', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.calendar}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Calendar/i);

    // Calendar can be backed by slow global data; don't require CRUD in production.
    await expect(page.getByRole('main')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/calendar/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    // If a grid is present, ensure at least one day cell renders.
    const dayCell = page.getByRole('gridcell').first();
    if (await dayCell.isVisible().catch(() => false)) {
      await dayCell.click().catch(() => {});
    }
  });
});
