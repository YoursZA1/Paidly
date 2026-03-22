import { test, expect } from './utils/fixtures';
import { APP_PATHS } from './utils/testConfig';
import { skipGuestProject } from './utils/skipGuestProject';

test.describe('AUTHENTICATION', () => {
  test.describe('Login', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('valid credentials redirect to Dashboard', async ({ page, baseURL, loginPage }, testInfo) => {
      const email = process.env.E2E_EMAIL || process.env.E2E_USER_EMAIL;
      const password = process.env.E2E_PASSWORD || process.env.E2E_USER_PASSWORD;
      test.skip(
        !email || !password,
        'E2E_EMAIL / E2E_PASSWORD (or E2E_USER_EMAIL / E2E_USER_PASSWORD) not set'
      );

      await loginPage.goto(baseURL!);
      await loginPage.login(email!, password!);

      await page.waitForURL((url) => !/\/Login/i.test(url.toString()), { timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`${escapeRegExp(APP_PATHS.dashboard)}|/Dashboard`, 'i'));

      await testInfo.attach('post-login-url.txt', { body: page.url(), contentType: 'text/plain' });
    });

    test('invalid credentials shows an error', async ({ page, baseURL, loginPage }) => {
      await loginPage.goto(baseURL!);
      await loginPage.login('invalid@example.com', 'wrong-password');

      const err = page.getByText(/invalid|incorrect|failed|error/i).first();
      await expect(err).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/\/Login/i);
    });
  });

  test.describe('Session persistence', () => {
    test.beforeEach(({}, testInfo) => {
      skipGuestProject(testInfo);
    });

    test('session persists across pages (auth storageState)', async ({ page, baseURL, sidebar }) => {
      test.skip(!baseURL, 'baseURL not set');

      await page.goto(`${baseURL}${APP_PATHS.dashboard}`, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/Dashboard/i);

      await sidebar.goto('Clients');
      await expect(page).toHaveURL(/\/Clients/i);

      await sidebar.goto('Invoices');
      await expect(page).toHaveURL(/\/Invoices/i);
    });
  });
});

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

