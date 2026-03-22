import { test, expect } from '@playwright/test';

/**
 * Marketing shell is public at /Home (PascalCase route). "/" is the authenticated Dashboard.
 * Budget is configurable for slow CI: PLAYWRIGHT_PERF_HERO_MS (default 12000).
 */
test.describe('PERFORMANCE', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Marketing home: hero visible within budget', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');
    const budgetMs = Number(process.env.PLAYWRIGHT_PERF_HERO_MS || 12_000);
    const start = Date.now();
    await page.goto(`${baseURL}/Home`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /Get Paid Faster/i })).toBeVisible({
      timeout: Math.min(budgetMs, 15_000),
    });
    const elapsed = Date.now() - start;
    expect(elapsed, `Hero paint took ${elapsed}ms (budget ${budgetMs}ms)`).toBeLessThan(budgetMs);
  });
});
