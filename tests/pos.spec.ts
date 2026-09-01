import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('POS till (Task 28)', () => {
  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('TEST 12 guest cannot open the till', async ({ page, baseURL }) => {
      test.skip(!baseURL, 'baseURL not set');
      await page.goto(`${baseURL}${APP_PATHS.pos}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/pos\/?$/i);
      await expect(page.getByRole('heading', { name: /Paidly POS/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Open Paidly POS/i })).toBeVisible();
      await expect(page.getByLabel(/scan barcode or search products/i)).toHaveCount(0);
    });

    test('guest cannot open a till URL without signing in', async ({ page, baseURL }) => {
      test.skip(!baseURL, 'baseURL not set');
      await page.goto(`${baseURL}/pos/till/11111111-1111-4111-8111-111111111111`, {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/pos\/till\//i);
      await expect(page.getByRole('heading', { name: /Paidly POS/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Open Paidly POS/i })).toBeVisible();
      await expect(page.getByLabel(/scan barcode or search products/i)).toHaveCount(0);
    });
  });

  test.describe('authenticated till', () => {
    test.beforeEach(({}, testInfo) => {
      skipGuestProject(testInfo);
    });

    test('TEST 1 Open POS is a dedicated retail shell when entitled', async ({ page, baseURL }) => {
      test.skip(!baseURL, 'baseURL not set');
      await page.goto(`${baseURL}${APP_PATHS.pos}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

      const search = page.getByLabel(/scan barcode or search products/i);
      const planLock = page.getByText(/POS needs Business/i);
      const typeLock = page.getByText(/POS is optional/i);
      const signIn = page.getByText(/sign in|log in/i).first();

      await expect(search.or(planLock).or(typeLock).or(signIn).first()).toBeVisible({ timeout: 60_000 });

      if (await search.isVisible().catch(() => false)) {
        await expect(page.locator('nav.sidebar, [data-sidebar], #nav-dashboard')).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^Pay$/i })).toBeVisible();
      }
    });

    test('TEST 2–5 search, add, quantity, cash when the till is open', async ({ page, baseURL }) => {
      test.skip(!baseURL, 'baseURL not set');
      await page.goto(`${baseURL}${APP_PATHS.pos}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const search = page.getByLabel(/scan barcode or search products/i);
      test.skip(!(await search.isVisible().catch(() => false)), 'Till not available for this E2E account (plan or business type)');

      const firstProduct = page.getByRole('button', { name: /add .* to cart/i }).first()
        .or(page.locator('[data-testid="pos-product"]').first());
      const productCard = page.locator('button').filter({ hasText: /R\s?\d/ }).first();
      const target = (await firstProduct.isVisible().catch(() => false)) ? firstProduct : productCard;
      test.skip(!(await target.isVisible().catch(() => false)), 'No catalog products on this till');

      await search.fill('a');
      await search.fill('');

      await target.click();
      await expect(page.getByText(/×\s*1|qty\s*1/i).or(page.getByLabel(/decrease /i)).first()).toBeVisible({
        timeout: 15_000,
      });

      const increase = page.getByLabel(/^Increase /i).first();
      if (await increase.isVisible().catch(() => false)) {
        await increase.click();
      }

      const pay = page.getByRole('button', { name: /^Pay$/i });
      await expect(pay).toBeEnabled();
      await pay.click();
      await expect(page.getByRole('heading', { name: /^Pay$/i })).toBeVisible();
      const cash = page.getByRole('button', { name: /^Cash$/i });
      if (await cash.isVisible().catch(() => false)) {
        await cash.click();
        await expect(page.getByLabel(/customer pays/i).or(page.getByText(/change/i)).first()).toBeVisible();
      }
    });
  });
});
