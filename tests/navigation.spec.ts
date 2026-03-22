import { test, expect } from './utils/fixtures';
import { APP_PATHS, SIDEBAR_LABELS } from './utils/testConfig';
import { attachConsoleGuards, expectNoConsoleErrors } from './utils/assertions';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('NAVIGATION', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Sidebar navigation routes and loads for all pages', async ({ page, baseURL, sidebar }) => {
    test.skip(!baseURL, 'baseURL not set');
    test.slow();
    test.setTimeout(180_000);

    const guard = attachConsoleGuards(page);

    const cases: Array<{ label: string; urlRe: RegExp; path: string }> = [
      { label: SIDEBAR_LABELS.dashboard, urlRe: /\/Dashboard/i, path: APP_PATHS.dashboard },
      { label: SIDEBAR_LABELS.clients, urlRe: /\/Clients/i, path: APP_PATHS.clients },
      { label: SIDEBAR_LABELS.invoices, urlRe: /\/Invoices/i, path: APP_PATHS.invoices },
      { label: SIDEBAR_LABELS.quotes, urlRe: /\/Quotes/i, path: APP_PATHS.quotes },
      { label: SIDEBAR_LABELS.services, urlRe: /\/Services/i, path: APP_PATHS.services },
      { label: SIDEBAR_LABELS.payslips, urlRe: /\/Payslips/i, path: APP_PATHS.payslips },
      { label: SIDEBAR_LABELS.cashFlow, urlRe: /\/CashFlow/i, path: APP_PATHS.cashFlow },
      { label: SIDEBAR_LABELS.reports, urlRe: /\/Reports/i, path: APP_PATHS.reports },
      { label: SIDEBAR_LABELS.notes, urlRe: /\/Notes/i, path: APP_PATHS.notes },
      { label: SIDEBAR_LABELS.calendar, urlRe: /\/Calendar/i, path: APP_PATHS.calendar },
      { label: SIDEBAR_LABELS.messages, urlRe: /\/Messages/i, path: APP_PATHS.messages },
      { label: SIDEBAR_LABELS.settings, urlRe: /\/Settings/i, path: APP_PATHS.settings },
    ];

    await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Dashboard/i);

    for (const c of cases) {
      const target = sidebar.item(c.label);
      await expect(target).toBeVisible({ timeout: 30_000 });
      await Promise.all([
        page.waitForURL(c.urlRe, { timeout: 60_000 }),
        target.click({ force: true }),
      ]);
      // Light “page loaded” sanity: no fatal error banners.
      await expect(page.getByText(/something went wrong|failed to load|error occurred/i)).toHaveCount(0);
    }

    await expectNoConsoleErrors(guard);
  });
});

