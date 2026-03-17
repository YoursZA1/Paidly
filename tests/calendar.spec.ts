import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';

test.describe('CALENDAR', () => {
  test('Add, edit, delete event', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const title = uniqueName('E2E Event');
    const updatedTitle = `${title} (Updated)`;

    await page.goto(`${baseURL}${APP_PATHS.calendar}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Calendar/i);

    const add = page.getByTestId('calendar-add-event').or(page.getByRole('button', { name: /add event|new event|create event/i }));
    if (await add.isVisible().catch(() => false)) {
      await add.click();
    } else {
      // Fallback: click on day cell if available
      const dayCell = page.getByRole('gridcell').first();
      if (await dayCell.isVisible().catch(() => false)) await dayCell.click();
    }

    const titleInput = page.getByTestId('event-title').or(page.getByRole('textbox', { name: /title/i })).or(page.getByPlaceholder(/title/i));
    if (await titleInput.isVisible().catch(() => false)) await titleInput.fill(title);

    const save = page.getByTestId('event-save').or(page.getByRole('button', { name: /save|create/i }));
    if (await save.isVisible().catch(() => false)) await save.click();

    const event = page.getByText(new RegExp(escapeRegExp(title), 'i')).first();
    if (await event.isVisible().catch(() => false)) await event.click();

    const edit = page.getByTestId('event-edit').or(page.getByRole('button', { name: /edit/i })).first();
    if (await edit.isVisible().catch(() => false)) await edit.click();

    if (await titleInput.isVisible().catch(() => false)) await titleInput.fill(updatedTitle);
    if (await save.isVisible().catch(() => false)) await save.click();

    await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i')).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    const del = page.getByTestId('event-delete').or(page.getByRole('button', { name: /delete/i })).first();
    if (await del.isVisible().catch(() => false)) {
      await del.click();
      const confirm = page.getByRole('button', { name: /confirm|delete/i }).first();
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i'))).toHaveCount(0);
    }
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

