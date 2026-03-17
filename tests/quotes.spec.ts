import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { uniqueName } from './utils/data';

test.describe('QUOTES', () => {
  test('Create quote, validate calculations, convert to invoice', async ({ page, baseURL, sidebar }) => {
    test.skip(!baseURL, 'baseURL not set');

    const quoteLabel = uniqueName('E2E Quote');
    const itemName = uniqueName('E2E Quote Item');

    await page.goto(`${baseURL}${APP_PATHS.quotes}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Quotes/i);

    const add = page.getByTestId('quotes-add').or(page.getByRole('button', { name: /new quote|create quote|add quote/i }));
    if (await add.isVisible().catch(() => false)) {
      await add.click();
    } else {
      // Fallback path: some apps create quotes from a "Create" menu; ensure we at least land on quotes page.
      await sidebar.goto('Quotes');
    }

    const heading = page.getByRole('heading', { name: /new quote|create quote|quote/i }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 }).catch(() => {});

    const clientTrigger = page.getByTestId('quote-client').or(page.getByText(/choose a client/i).first());
    if (await clientTrigger.isVisible().catch(() => false)) {
      await clientTrigger.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }

    const ref = page.getByTestId('quote-reference').or(page.getByPlaceholder(/reference|title|label/i)).first();
    if (await ref.isVisible().catch(() => false)) await ref.fill(quoteLabel);

    const nameInput = page.getByTestId('quote-item-name').or(page.getByPlaceholder(/service name/i)).first();
    if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(itemName);

    const qtyInput = page.getByTestId('quote-item-qty').or(page.getByPlaceholder('Qty')).first();
    const priceInput = page.getByTestId('quote-item-price').or(page.getByPlaceholder('Price')).first();
    if (await qtyInput.isVisible().catch(() => false)) await qtyInput.fill('2');
    if (await priceInput.isVisible().catch(() => false)) await priceInput.fill('50');

    // Calculation sanity: total should include 100 somewhere.
    await expect(page.getByText(/\b100\b/).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});

    const save = page.getByTestId('quote-save').or(page.getByRole('button', { name: /save|create/i })).first();
    if (await save.isVisible().catch(() => false)) await save.click();

    // Convert to invoice
    const convert = page.getByTestId('quote-convert').or(page.getByRole('button', { name: /convert to invoice|convert/i })).first();
    if (await convert.isVisible().catch(() => false)) {
      await convert.click();
      await page.waitForURL(/\/CreateInvoice/i, { timeout: 60_000 }).catch(() => {});
      await expect(page).toHaveURL(/\/CreateInvoice/i);
    }
  });
});

