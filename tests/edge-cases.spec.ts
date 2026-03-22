import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';

test.describe('EDGE CASES', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(/guest/i.test(testInfo.project.name), 'Requires authenticated session');
  });

  test('Create invoice: save draft without client shows validation', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.createInvoice}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible({ timeout: 60_000 });

    const saveDraft = page.getByTestId('invoice-save-draft').first();
    await expect(saveDraft).toBeVisible({ timeout: 30_000 });
    await saveDraft.click({ force: true });

    await expect(
      page.getByText(/please select a client|validation error|select a client/i).first()
    ).toBeVisible({ timeout: 15_000 });
  });
});
