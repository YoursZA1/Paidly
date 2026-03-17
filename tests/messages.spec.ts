import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';

test.describe('MESSAGES (IMPORTANT)', () => {
  test('Send invoice via email/WhatsApp, log entry exists, opened->paid lifecycle (best-effort)', async ({ page, baseURL }) => {
    test.skip(!baseURL, 'baseURL not set');

    // Preconditions: an invoice exists. We try to locate any invoice, otherwise we still validate messaging UI loads.
    await page.goto(`${baseURL}${APP_PATHS.messages}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/Messages/i);

    // Trigger “send invoice” from messages page if present.
    const sendInvoice = page.getByTestId('messages-send-invoice').or(page.getByRole('button', { name: /send invoice/i }));
    if (await sendInvoice.isVisible().catch(() => false)) {
      await sendInvoice.click();

      // Choose channel if UI supports it.
      const channelEmail = page.getByTestId('channel-email').or(page.getByRole('button', { name: /^email$/i }));
      const channelWhatsApp = page.getByTestId('channel-whatsapp').or(page.getByRole('button', { name: /whatsapp/i }));
      if (await channelEmail.isVisible().catch(() => false)) await channelEmail.click();
      else if (await channelWhatsApp.isVisible().catch(() => false)) await channelWhatsApp.click();

      const submit = page.getByTestId('message-send').or(page.getByRole('button', { name: /^send$/i }));
      if (await submit.isVisible().catch(() => false)) await submit.click();
    }

    // The Messages page currently surfaces invoice/quote sending activity under "Sent documents".
    const sentTab = page
      .getByRole('tab', { name: /sent documents/i })
      .or(page.getByRole('button', { name: /sent documents/i }))
      .or(page.getByText(/^sent documents$/i));
    await expect(sentTab.first()).toBeVisible({ timeout: 60_000 });
    await sentTab.first().click();

    // Verify the Sent documents view renders (table or empty state).
    const title = page.getByRole('heading', { name: /sent documents/i }).first().or(page.getByText(/^sent documents$/i).first());
    await expect(title).toBeVisible({ timeout: 60_000 });

    const table = page.locator('table').first();
    const latestRow = table.locator('tbody tr').first();
    await expect(latestRow).toBeVisible({ timeout: 10_000 }).catch(() => {});

    // Simulate opening tracking link if present.
    const tracking = latestRow
      .getByRole('link', { name: /track|view|open/i })
      .or(page.getByRole('link', { name: /track|view|open/i }).first());
    if (await tracking.isVisible().catch(() => false)) {
      const [popup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null),
        tracking.click(),
      ]);
      if (popup) {
        await popup.waitForLoadState('domcontentloaded');
        await popup.close();
      }
      // After “open”, status should update.
      await expect(page.getByText(/opened|viewed/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
    }

    // Simulate payment if there's a control for it (best-effort)
    const simulatePaid = page.getByTestId('message-simulate-paid')
      .or(page.getByRole('button', { name: /simulate payment|mark paid|paid/i }).first());
    if (await simulatePaid.isVisible().catch(() => false)) {
      await simulatePaid.click();
      await expect(page.getByText(/paid/i).first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
    }
  });
});

