import { test, expect } from '@playwright/test';
import { APP_PATHS } from './utils/testConfig';

type StepResult = { name: string; ok: boolean; details?: string };

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function runStep(results: StepResult[], name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    // Keep output very explicit for live terminal monitoring
    console.log(`STEP PASS: ${name}`);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, details });
    console.log(`STEP FAIL: ${name}`);
    console.log(`DETAILS: ${details}`);
  }
}

test('MANUAL FLOW: bank -> service -> quote -> invoice preview/download -> note', async ({ page, baseURL }) => {
  test.setTimeout(8 * 60_000);
  test.skip(!baseURL, 'baseURL not set');

  const email = requireEnv('E2E_EMAIL');
  const password = requireEnv('E2E_PASSWORD');
  const results: StepResult[] = [];

  const ts = Date.now();
  const serviceName = `Manual Service ${ts}`;
  const quoteLabel = `Manual Quote ${ts}`;
  const noteTitle = `Manual Note ${ts}`;

  // Prefer existing auth state from setup project. Only attempt direct login as fallback.
  await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
  if (/\/Login/i.test(page.url())) {
    await runStep(results, '0) Login fallback', async () => {
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.getByRole('button', { name: /^sign in$/i }).click();
      await page.waitForURL((u) => !/\/Login/i.test(u.toString()), { timeout: 45_000 });
    });
  }

  await runStep(results, '1) Add bank account', async () => {
    await page.goto(`${baseURL}${APP_PATHS.settings}?tab=payments`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Settings/i, { timeout: 30_000 });

    const addBank = page
      .getByTestId('bank-add-method')
      .or(page.getByTestId('bank-add-method-empty'))
      .or(
        page
      .getByRole('button', { name: /add payment method|add your first payment method|add new account/i })
      )
      .first();
    await expect(addBank).toBeVisible({ timeout: 20_000 });
    await addBank.click();

    const bankName = page.getByLabel(/bank name|platform name/i).first();
    await expect(bankName).toBeVisible({ timeout: 15_000 });
    if (await bankName.isVisible().catch(() => false)) await bankName.fill('Paidly Bank');

    const accountNumber = page.getByLabel(/account number/i).first();
    if (await accountNumber.isVisible().catch(() => false)) await accountNumber.fill('1234567890');

    const accountName = page.getByLabel(/account\/holder name/i).first();
    if (await accountName.isVisible().catch(() => false)) await accountName.fill('Paidly QA Account');

    const saveBank = page.getByRole('button', { name: /save method|update method/i }).first();
    await expect(saveBank).toBeVisible({ timeout: 10_000 });
    await saveBank.click();

    await expect(bankName).toBeHidden({ timeout: 20_000 });
  });

  await runStep(results, '2) Create product/service', async () => {
    await page.goto(`${baseURL}${APP_PATHS.services}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Services/i, { timeout: 30_000 });

    const add = page
      .getByTestId('services-add')
      .or(page.getByRole('button', { name: /add service|new service|create service|add product|new product/i }))
      .first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();

    const nameInput = page.getByLabel(/item name/i).first();
    await expect(nameInput).toBeVisible({ timeout: 20_000 });
    await nameInput.fill(serviceName);

    const priceInput = page.locator('#default_rate');
    if (await priceInput.isVisible().catch(() => false)) await priceInput.fill('100');

    const save = page.getByRole('button', { name: /create item|update item/i }).first();
    await save.click();

    await expect(page.getByRole('dialog').first()).toBeHidden({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(new RegExp(serviceName, 'i')).first()).toBeVisible({ timeout: 30_000 });
  });

  await runStep(results, '3) Create quote', async () => {
    await page.goto(`${baseURL}${APP_PATHS.quotes}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Quotes/i, { timeout: 30_000 });

    const add = page
      .getByTestId('quotes-add')
      .or(page.getByRole('button', { name: /new quote|create quote|add quote/i }))
      .first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();

    const ref = page.getByTestId('quote-reference').or(page.getByPlaceholder(/reference|title|label/i)).first();
    if (await ref.isVisible().catch(() => false)) await ref.fill(quoteLabel);

    const clientTrigger = page.getByTestId('quote-client').or(page.getByText(/choose a client/i).first());
    if (await clientTrigger.isVisible().catch(() => false)) {
      await clientTrigger.click();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }

    const itemName = page.getByTestId('quote-item-name').or(page.getByPlaceholder(/service name|item name/i)).first();
    if (await itemName.isVisible().catch(() => false)) await itemName.fill(serviceName);

    const qtyInput = page.getByTestId('quote-item-qty').or(page.getByPlaceholder('Qty')).first();
    const priceInput = page.getByTestId('quote-item-price').or(page.getByPlaceholder('Price')).first();
    if (await qtyInput.isVisible().catch(() => false)) await qtyInput.fill('1');
    if (await priceInput.isVisible().catch(() => false)) await priceInput.fill('100');

    const save = page.getByTestId('quote-save').or(page.getByRole('button', { name: /save|create/i })).first();
    if (await save.isVisible().catch(() => false)) await save.click();
  });

  await runStep(results, '4) Convert quote to invoice', async () => {
    await page.goto(`${baseURL}${APP_PATHS.quotes}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Quotes/i, { timeout: 30_000 });

    const menuTrigger = page.getByTestId('quote-actions-trigger').first();
    await expect(menuTrigger).toBeVisible({ timeout: 20_000 });
    await menuTrigger.click();

    const convert = page.getByTestId('quote-convert-to-invoice').first();
    await expect(convert).toBeVisible({ timeout: 15_000 });
    await convert.click();
    await page.waitForURL(/\/CreateInvoice/i, { timeout: 60_000 });
  });

  await runStep(results, '5) Preview + download invoice', async () => {
    await page.goto(`${baseURL}${APP_PATHS.invoices}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Invoices/i, { timeout: 30_000 });

    const actionTrigger = page.getByTestId('invoice-actions-trigger').first();
    await expect(actionTrigger).toBeVisible({ timeout: 20_000 });
    await actionTrigger.click();

    const preview = page.getByTestId('invoice-preview-pdf').first();
    await expect(preview).toBeVisible({ timeout: 20_000 });
    await preview.click();
    await page.waitForTimeout(1200);

    await actionTrigger.click();
    const download = page.getByTestId('invoice-download-pdf').first();
    await expect(download).toBeVisible({ timeout: 30_000 });

    const [downloadEvent] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }).catch(() => null),
      download.click(),
    ]);

    if (!downloadEvent) {
      await page.waitForTimeout(1500);
    }
  });

  await runStep(results, '6) Create note', async () => {
    await page.goto(`${baseURL}${APP_PATHS.notes}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Notes/i, { timeout: 30_000 });

    const add = page
      .getByTestId('notes-add')
      .or(page.getByRole('button', { name: /add note|new note|create note/i }))
      .first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();

    const title = page.getByTestId('note-title').or(page.getByPlaceholder(/title/i)).first();
    if (!(await title.isVisible().catch(() => false))) {
      const firstNote = page.getByTestId('note-row').first();
      await expect(firstNote).toBeVisible({ timeout: 20_000 });
      await firstNote.click();
    }
    await expect(title).toBeVisible({ timeout: 30_000 });
    await title.fill(noteTitle);

    const body = page.getByTestId('note-body').or(page.getByPlaceholder(/start typing|body|content/i)).first();
    if (await body.isVisible().catch(() => false)) await body.fill('Manual flow note body');

    await expect(page.getByText(new RegExp(noteTitle, 'i')).first()).toBeVisible({ timeout: 30_000 });
  });

  console.log('\n=== MANUAL FLOW SUMMARY ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}`);
  }
  const passCount = results.filter((r) => r.ok).length;
  const failCount = results.length - passCount;
  console.log(`TOTAL: ${passCount} passed, ${failCount} failed`);
});

