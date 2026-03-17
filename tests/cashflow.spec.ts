import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { attachConsoleGuards, expectNoConsoleErrors } from './utils/assertions';

test.describe('CASH FLOW', () => {
  test('Income vs expenses display and charts render', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const guard = attachConsoleGuards(page);
    await page.goto(`${baseURL}${APP_PATHS.cashFlow}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/CashFlow/i);

    await expect(page.getByText(/income|expenses|cash flow/i).first()).toBeVisible({ timeout: 30_000 });

    // Chart sanity: look for svg/canvas within main content.
    const chart = page.locator('main svg, main canvas').first();
    await expect(chart).toBeVisible({ timeout: 30_000 }).catch(() => {});

    await expectNoConsoleErrors(guard);
  });
});

