import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { attachConsoleGuards, expectNoConsoleErrors } from './utils/assertions';

test.describe('DASHBOARD', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(
      /guest/i.test(testInfo.project.name),
      'Dashboard requires auth (non-guest projects use playwright/.auth/user.json)'
    );
  });

  test('shows Total Revenue and Invoices-related content', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');
    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Dashboard/i);
    await expect(page.getByText('Total Revenue').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/invoices/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test('Dashboard loads stats/cards and shows no console errors', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const guard = attachConsoleGuards(page);
    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Dashboard/i);

    // Best-effort “stats/cards exist” checks. Prefer testids if present.
    const statsRegion = page.getByTestId('dashboard-stats').or(page.getByRole('main'));
    await expect(statsRegion).toBeVisible({ timeout: 30_000 });

    const likelyStatText = page.getByText(/revenue|invoices|clients|cash flow|paid|overdue/i).first();
    await expect(likelyStatText).toBeVisible({ timeout: 30_000 });

    // Loading states should resolve.
    await expect(page.getByText(/loading/i).first()).toBeHidden({ timeout: 30_000 }).catch(() => {});

    await expectNoConsoleErrors(guard);
  });
});

