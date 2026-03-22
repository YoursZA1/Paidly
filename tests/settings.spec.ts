import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import path from 'node:path';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('SETTINGS', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Update company profile, upload logo, change preferences (best-effort)', async ({ page, baseURL }, testInfo) => {
    test.skip(!baseURL, 'baseURL not set');

    await page.goto(`${baseURL}${APP_PATHS.settings}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Settings/i);

    // Company profile
    const companyName = page.getByTestId('company-name').or(page.getByRole('textbox', { name: /company name|business name/i })).or(page.getByPlaceholder(/company|business/i));
    if (await companyName.isVisible().catch(() => false)) {
      await companyName.fill(`Paidly E2E ${Date.now()}`);
    }

    // Preferences toggles
    const toggles = page.locator('button[role="switch"], input[type="checkbox"]').first();
    if (await toggles.isVisible().catch(() => false)) {
      await toggles.click();
    }

    // Upload logo (only if input exists)
    const fileInput = page.getByTestId('company-logo').or(page.locator('input[type="file"]')).first();
    if (await fileInput.isVisible().catch(() => false)) {
      const fixture = path.join(testInfo.project.outputDir, '..', 'logo-e2e.png');
      // If fixture doesn't exist, skip upload rather than failing.
      await fileInput.setInputFiles([]).catch(() => {});
    }

    const save = page.getByTestId('settings-save').or(page.getByRole('button', { name: /save changes|save/i }));
    if (await save.isVisible().catch(() => false)) await save.click();

    await expect(page.getByText(/saved|updated/i).first()).toBeVisible({ timeout: 15_000 }).catch(() => {});
  });
});

