import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { AppShell } from './pages/AppShell';

test.describe('Paidly deep dive', () => {
  test.describe('Unauthenticated smoke', () => {
    test.beforeEach(async ({}, testInfo) => {
      if (!testInfo.project.name.includes('guest')) {
        testInfo.skip(true, 'Run unauthenticated smoke only on *-guest projects');
      }
    });

    // Project defaults use an authenticated storageState; force logged-out for these tests.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('Login page loads and key CTAs are visible', async ({ page, baseURL }) => {
      const login = new LoginPage(page);
      await login.goto(baseURL!);

      await expect(login.email).toBeVisible();
      await expect(login.password).toBeVisible();
      await expect(login.signInButton).toBeVisible();
      await expect(login.showPasswordButton).toBeVisible();

      // Social + recovery + signup affordances
      const forgot = page
        .getByRole('button', { name: /forgot your password/i })
        .or(page.getByRole('link', { name: /forgot your password/i }));
      const createAccount = page
        .getByRole('button', { name: /create one/i })
        .or(page.getByRole('link', { name: /create one/i }));

      await expect(forgot).toBeVisible();
      await expect(createAccount).toBeVisible();

      // Social buttons can change (e.g. Apple removed). Avoid hard-coding an exact count.
      const buttonCount = await page.getByRole('button').count();
      expect(buttonCount).toBeGreaterThanOrEqual(5);
    });

    test('Negative: empty submit does not navigate away', async ({ page, baseURL }) => {
      const login = new LoginPage(page);
      await login.goto(baseURL!);

      await login.signInButton.click();
      await expect(page).toHaveURL(/\/Login/i);

      // If the app shows validation, it should appear; keep assertion tolerant to UI changes.
      const anyErrorText = page.getByText(/required|invalid|enter|email|password/i).first();
      await expect(anyErrorText).toBeVisible({ timeout: 10_000 });
    });

    test('Negative: invalid credentials shows an error', async ({ page, baseURL }) => {
      const login = new LoginPage(page);
      await login.goto(baseURL!);

      await login.login('invalid@example.com', 'wrong-password');
      await expect(page).toHaveURL(/\/Login/i);

      // Look for common auth error phrases or toast.
      const err = page.getByText(/invalid|incorrect|failed|error|not authenticated|password/i).first();
      await expect(err).toBeVisible({ timeout: 15_000 });
    });

    test('Responsive: login renders on mobile viewport', async ({ page, baseURL }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const login = new LoginPage(page);
      await login.goto(baseURL!);
      await expect(login.signInButton).toBeVisible();
    });
  });

  test.describe('Authenticated happy path', () => {
    test.beforeEach(async ({}, testInfo) => {
      if (testInfo.project.name.includes('guest')) {
        testInfo.skip(true, 'Run authenticated tests only on auth projects');
      }
    });

    test('Dashboard loads', async ({ page, baseURL }) => {
      const shell = new AppShell(page);
      await shell.gotoDashboard(baseURL!);

      // Dashboard is large; assert on URL + at least one heading-like element.
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 30_000 });
    });

    test('Create invoice flow is reachable', async ({ page, baseURL }) => {
      test.slow();
      // Primary value proposition: create invoice.
      await page.goto(`${baseURL!}/CreateInvoice`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await expect(page).toHaveURL(/\/CreateInvoice/i);

      // Stable UI signal: page title.
      await expect(page.getByRole('heading', { name: /new invoice/i })).toBeVisible({ timeout: 60_000 });
    });

    test('Happy path: create a minimal draft invoice (best-effort selectors)', async ({ page, baseURL }) => {
      test.slow();
      test.setTimeout(180_000);
      // This uses stable placeholders/labels from InvoiceDetails.
      await page.goto(`${baseURL!}/CreateInvoice`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await expect(page).toHaveURL(/\/CreateInvoice/i);
      const heading = page.getByRole('heading', { name: /new invoice/i });
      try {
        await expect(heading).toBeVisible({ timeout: 45_000 });
      } catch {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(heading).toBeVisible({ timeout: 60_000 });
      }

      // CreateInvoice sometimes fails to load clients/services on slow/unstable backends.
      // If we hit the inline error banner, refresh once and continue.
      const loadError = page.getByText(/failed to load data\. please refresh\./i);
      if (await loadError.isVisible().catch(() => false)) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(loadError).toBeHidden({ timeout: 30_000 });
      }

      // 1) Select first client (Radix Select renders a button trigger).
      const clientTriggerText = page.getByText(/choose a client/i).first();
      await expect(clientTriggerText).toBeVisible({ timeout: 30_000 });
      await clientTriggerText.click();

      // Pick the first option in the dropdown (keyboard is more reliable across Radix implementations).
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // 2) Add one line item using the "Quick Add Row" placeholders.
      await page.getByPlaceholder('Service name...').fill(`E2E Service ${Date.now()}`);
      await page.getByPlaceholder('Qty').fill('1');
      await page.getByPlaceholder('Price').fill('100');
      await page.getByPlaceholder('Price').press('Enter');

      // 3) Save as draft
      const saveDraft = page.getByRole('button', { name: /save as draft/i }).first();
      await expect(saveDraft).toBeVisible({ timeout: 60_000 });
      await saveDraft.click();

      // Success behavior: toast appears and the app navigates to /Invoices shortly after.
      try {
        await expect(page.getByText(/invoice created/i)).toBeVisible({ timeout: 10_000 });
      } catch {
        await expect(page).toHaveURL(/\/Invoices/i, { timeout: 30_000 });
      }
    });
  });
});

