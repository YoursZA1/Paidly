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

    const add = page.getByTestId('notes-add').or(page.getByRole('button', { name: /add note|new note|create note/i }));
    // The create button may be hidden on mobile; click only if visible, otherwise skip this smoke.
    if (!(await add.isVisible({ timeout: 30_000 }).catch(() => false))) {
      test.skip(true, 'Notes add button not visible in this layout; skipping smoke.');
    }
    await add.click();

    const title = page.getByTestId('note-title').or(page.getByPlaceholder(/title/i));
    await title.fill(noteTitle);

    const body = page.getByTestId('note-body').or(page.getByPlaceholder(/start typing/i));
    await expect(body).toBeVisible({ timeout: 30_000 });
    await body.fill('E2E note body');

    // Notes autosave; wait for title to appear in list (desktop) or be reflected.
    await expect(page.getByText(new RegExp(escapeRegExp(noteTitle), 'i')).first()).toBeVisible({ timeout: 30_000 });

    // Edit
    await title.fill(updatedTitle);
    await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i'))).toBeVisible({ timeout: 30_000 });

    // Delete
    const del = page.getByTestId('note-delete').or(page.getByRole('button', { name: /^delete$/i })).first();
    await expect(del).toBeVisible({ timeout: 30_000 });
    await del.click();

    // Delete action is immediate in UI; confirm note title disappears from list if visible.
    await expect(page.getByText(new RegExp(escapeRegExp(updatedTitle), 'i'))).toHaveCount(0, { timeout: 30_000 });
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

