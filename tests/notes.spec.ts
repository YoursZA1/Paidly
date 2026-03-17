import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';

test.describe('NOTES', () => {
  test('Create, edit, delete note', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    const noteTitle = uniqueName('E2E Note');
    const updatedTitle = `${noteTitle} (Updated)`;

    await page.goto(`${baseURL}${APP_PATHS.notes}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Notes/i);

    const add = page.getByTestId('notes-add').or(page.getByRole('button', { name: /new note|add note|create note/i }));
    if (await add.isVisible().catch(() => false)) await add.click();

    const title = page.getByTestId('note-title').or(page.getByRole('textbox', { name: /title/i })).or(page.getByPlaceholder(/title/i));
    await expect(title).toBeVisible({ timeout: 30_000 });
    await title.fill(noteTitle);

    const body = page.getByTestId('note-body').or(page.getByRole('textbox', { name: /note|content|body/i })).or(page.getByPlaceholder(/write|note|content/i));
    if (await body.isVisible().catch(() => false)) await body.fill('E2E note body');

    const save = page.getByTestId('note-save').or(page.getByRole('button', { name: /save|create/i }));
    await save.click();
    await expect(page.getByText(new RegExp(escapeRegExp(noteTitle), 'i'))).toBeVisible({ timeout: 30_000 });

    // Edit
    await page.getByText(new RegExp(escapeRegExp(noteTitle), 'i')).first().click();
    const edit = page.getByTestId('note-edit').or(page.getByRole('button', { name: /edit/i })).first();
    if (await edit.isVisible().catch(() => false)) await edit.click();

    await title.fill(updatedTitle);
    await save.click();
    await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i'))).toBeVisible({ timeout: 30_000 });

    // Delete
    const del = page.getByTestId('note-delete').or(page.getByRole('button', { name: /delete/i })).first();
    await expect(del).toBeVisible();
    await del.click();
    const confirm = page.getByRole('button', { name: /confirm|delete/i }).first();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i'))).toHaveCount(0);
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

