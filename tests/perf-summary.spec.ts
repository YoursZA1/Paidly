import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('PERFORMANCE SUMMARY (smoke)', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Measure domcontentloaded times for key pages', async ({ page, baseURL }, testInfo) => {
    test.skip(!baseURL, 'baseURL not set');

    const cases: Array<{ name: string; path: string; urlRe: RegExp }> = [
      { name: 'Dashboard', path: APP_PATHS.dashboard, urlRe: /\/Dashboard/i },
      { name: 'Invoices', path: APP_PATHS.invoices, urlRe: /\/Invoices/i },
      { name: 'Quotes', path: APP_PATHS.quotes, urlRe: /\/Quotes/i },
      { name: 'Settings', path: APP_PATHS.settings, urlRe: /\/Settings/i },
      { name: 'Payslips', path: APP_PATHS.payslips, urlRe: /\/Payslips/i },
    ];

    const results: Array<{ page: string; ms: number; url: string }> = [];

    for (const c of cases) {
      const start = Date.now();
      await page.goto(`${baseURL}${c.path}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(c.urlRe);
      results.push({ page: c.name, ms: Date.now() - start, url: page.url() });
    }

    const body = results.map((r) => `${r.page}\t${r.ms}ms\t${r.url}`).join('\n');
    console.log('\nPERF SUMMARY (domcontentloaded)\n' + body + '\n');
    await testInfo.attach('perf-summary.txt', { body, contentType: 'text/plain' });

    // Guardrail: don't fail builds due to network variance.
    expect(results.length).toBe(cases.length);
  });
});

