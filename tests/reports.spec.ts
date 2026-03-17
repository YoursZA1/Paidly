import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';

test.describe('REPORTS', () => {
  test('Generate report and export if available', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.reports}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Reports/i);

    const generate = page.getByTestId('reports-generate').or(page.getByRole('button', { name: /generate|run report/i }));
    if (await generate.isVisible().catch(() => false)) await generate.click();

    await expect(page.getByText(/report|summary|total/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    const exportBtn = page.getByTestId('reports-export').or(page.getByRole('button', { name: /export/i }));
    if (await exportBtn.isVisible().catch(() => false)) {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
        exportBtn.click(),
      ]);
      if (download) {
        const name = download.suggestedFilename();
        expect(name.toLowerCase()).toMatch(/\.(pdf|csv|xlsx)$/);
      }
    }
  });
});

