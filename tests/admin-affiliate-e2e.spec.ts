import { test, expect } from '@playwright/test';
import { adminAffiliateE2ePrereqs, resolveApiBase } from './helpers/adminAffiliateE2eEnv';
import {
  deleteAffiliateApplication,
  getAffiliateApplicationStatus,
  insertPendingAffiliateApplication,
} from './helpers/seedAffiliateApplication';
import { getAccessTokenForUser } from './helpers/adminApiSession';

/**
 * Scoped E2E: admin affiliate decline (UI + API) with service-role seed.
 *
 * Run (from repo root, Chromium browsers installed):
 *   npm run playwright:install   # once
 *   cp playwright/env.e2e.example .env.e2e && edit .env.e2e
 *   npm run test:e2e:admin-affiliate
 *
 * `playwright.admin.config.ts` loads `.env.e2e` if present (gitignored). CI: set the same vars as secrets.
 *
 *   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 *   E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY
 *   Optional: VITE_SERVER_URL=http://127.0.0.1:5179 in .env.development or .env.e2e for the Vite webServer
 *
 * Approve + Resend + email delivery are not automated here (need linked user + Resend); use manual QA or extend with E2E fixtures.
 */

test.describe('Admin affiliate (decline)', () => {
  test.describe.configure({ mode: 'serial' });

  test('UI: admin declines a seeded pending application', async ({ page, baseURL }) => {
    const p = adminAffiliateE2ePrereqs();
    test.skip(
      !p.ok,
      'Need E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD, Supabase URL + anon + service role (see tests/helpers/adminAffiliateE2eEnv.ts)'
    );

    const uniqueEmail = `e2e-affiliate-${Date.now()}@paidly-e2e.test`;
    let rowId: string;
    try {
      rowId = await insertPendingAffiliateApplication(p.supabaseUrl!, p.serviceRole!, uniqueEmail);
    } catch (e) {
      test.skip(true, `Seed failed: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }

    try {
      await page.goto(`${baseURL}/Login`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      await page.locator('#landing-login-email').fill(p.adminEmail!);
      await page.locator('#landing-login-password').fill(p.adminPassword!);
      await page.getByRole('button', { name: /^sign in$/i }).click();
      await page.waitForURL((url) => !/\/Login/i.test(url.toString()), { timeout: 30_000 });

      await page.goto(`${baseURL}/admin-v2/affiliates`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: 'Affiliates' })).toBeVisible({ timeout: 20_000 });

      const apiDown = page.getByRole('alert').filter({ hasText: /Could not load affiliate submissions/i });
      if (await apiDown.isVisible().catch(() => false)) {
        test.skip(true, 'Affiliate admin API unreachable — start Node API and set VITE_SERVER_URL (playwright.admin.config starts both)');
        return;
      }

      await page.getByPlaceholder('Search affiliates...').fill(uniqueEmail);
      await page.getByRole('button', { name: 'Decline application' }).first().click();
      await expect(page.getByText('Application declined')).toBeVisible({ timeout: 20_000 });

      const status = await getAffiliateApplicationStatus(p.supabaseUrl!, p.serviceRole!, rowId);
      expect(status?.toLowerCase()).toBe('rejected');
    } finally {
      await deleteAffiliateApplication(p.supabaseUrl!, p.serviceRole!, rowId).catch(() => {});
    }
  });

  test('API: POST /api/admin/decline marks application rejected', async () => {
    const p = adminAffiliateE2ePrereqs();
    test.skip(!p.ok, 'Same prereqs as UI test');

    const uniqueEmail = `e2e-affiliate-api-${Date.now()}@paidly-e2e.test`;
    const rowId = await insertPendingAffiliateApplication(p.supabaseUrl!, p.serviceRole!, uniqueEmail);

    try {
      const token = await getAccessTokenForUser(
        p.supabaseUrl!,
        p.supabaseAnon!,
        p.adminEmail!,
        p.adminPassword!
      );
      const apiBase = resolveApiBase();
      const res = await fetch(`${apiBase}/api/admin/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ applicationId: rowId }),
      });

      const responseText = await res.text();
      expect(res.status).toBe(200);
      let body: { ok?: boolean } = {};
      try {
        body = JSON.parse(responseText) as { ok?: boolean };
      } catch {
        throw new Error(`Non-JSON (${res.status}): ${responseText.slice(0, 240)}`);
      }
      expect(body).toMatchObject({ ok: true });

      const status = await getAffiliateApplicationStatus(p.supabaseUrl!, p.serviceRole!, rowId);
      expect(status?.toLowerCase()).toBe('rejected');
    } finally {
      await deleteAffiliateApplication(p.supabaseUrl!, p.serviceRole!, rowId).catch(() => {});
    }
  });
});
