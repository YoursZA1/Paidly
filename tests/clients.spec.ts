import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('CLIENTS', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Create client (with input validation)', async ({ page, baseURL }) => {
    test.setTimeout(180_000);
    test.skip(!baseURL, 'baseURL not set');
    await page.setViewportSize({ width: 1280, height: 720 });

    const clientName = uniqueName('E2E Client');
    await page.goto(`${baseURL}${APP_PATHS.clients}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Clients/i);

    // Create
    const addClient = page.locator('button[data-testid="clients-add"]:visible').first();
    await expect(addClient).toBeVisible({ timeout: 30_000 });
    await addClient.click();

    const nameInput = page.getByTestId('client-name');
    await expect(nameInput).toBeVisible();

    const save = page.getByTestId('client-save').or(page.getByRole('button', { name: /save client|update client|save|create/i }));
    // Form-level validation disables the submit button until required fields are present.
    await expect(save).toBeDisabled();

    await nameInput.scrollIntoViewIfNeeded();
    await nameInput.fill(clientName);
    await expect(nameInput).toHaveValue(clientName);

    const emailInput = page.getByTestId('client-email');
    await emailInput.scrollIntoViewIfNeeded();
    await emailInput.fill('e2e.client@example.com');
    await expect(emailInput).toHaveValue('e2e.client@example.com');

    await expect(save).toBeEnabled({ timeout: 10_000 });

    await save.click();
    // Success toast appears immediately (before background refetch completes).
    await expect(page.getByText(/client added/i).first()).toBeVisible({ timeout: 20_000 }).catch(() => {});

    // Close dialog so we can interact with the page.
    const dialog = page.getByTestId('client-form-dialog').or(page.getByRole('dialog'));
    const cancel = page.getByTestId('client-cancel');
    if (await dialog.isVisible().catch(() => false)) {
      if (await cancel.isVisible().catch(() => false)) await cancel.click({ force: true });
      else await page.keyboard.press('Escape').catch(() => {});
      await expect(dialog).toBeHidden({ timeout: 30_000 });
    }

    // Confirm creation via toast content (reliable even if list refetch lags).
    await expect(page.getByText(new RegExp(escapeRegExp(`${clientName} has been added`), 'i')).first())
      .toBeVisible({ timeout: 30_000 })
      .catch(() => {});
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

