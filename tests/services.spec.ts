import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('SERVICES', () => {
  test.beforeEach(({}, testInfo) => {
    skipGuestProject(testInfo);
  });

  test('Add, edit, delete service', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const serviceName = uniqueName('E2E Service');
    const updatedName = `${serviceName} (Updated)`;

    await page.goto(`${baseURL}${APP_PATHS.services}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Services/i);

    const add = page.getByTestId('services-add').or(page.getByRole('button', { name: /add service|new service|create service/i }));
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();

    const nameInput = page.getByTestId('service-name').or(page.getByRole('textbox', { name: /service name|name/i })).or(page.getByPlaceholder(/service name|name/i));
    await expect(nameInput).toBeVisible();
    await nameInput.fill(serviceName);

    const priceInput = page.getByTestId('service-price').or(page.getByPlaceholder(/price|rate/i));
    if (await priceInput.isVisible().catch(() => false)) await priceInput.fill('100');

    const save = page.getByTestId('service-save').or(page.getByRole('button', { name: /save|create/i }));
    await save.click();
    await expect(page.getByText(new RegExp(escapeRegExp(serviceName), 'i'))).toBeVisible({ timeout: 30_000 });

    // Edit
    await page.getByText(new RegExp(escapeRegExp(serviceName), 'i')).first().click();
    const edit = page.getByTestId('service-edit').or(page.getByRole('button', { name: /edit/i })).first();
    if (await edit.isVisible().catch(() => false)) await edit.click();

    await nameInput.fill(updatedName);
    await save.click();
    await expect(page.getByText(new RegExp(escapeRegExp(updatedName), 'i'))).toBeVisible({ timeout: 30_000 });

    // Delete
    const del = page.getByTestId('service-delete').or(page.getByRole('button', { name: /delete/i })).first();
    await expect(del).toBeVisible();
    await del.click();
    const confirm = page.getByRole('button', { name: /confirm|delete/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByText(new RegExp(escapeRegExp(updatedName), 'i'))).toHaveCount(0);
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

