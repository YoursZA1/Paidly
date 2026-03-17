import { test as base, expect, type Page, type TestInfo } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AppShell } from '../pages/AppShell';
import { Sidebar } from '../pages/Sidebar';
import { attachConsoleGuards, expectNoConsoleErrors } from './assertions';

type Fixtures = {
  loginPage: LoginPage;
  appShell: AppShell;
  sidebar: Sidebar;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  appShell: async ({ page }, use) => {
    await use(new AppShell(page));
  },
  sidebar: async ({ page }, use) => {
    await use(new Sidebar(page));
  },
});

export { expect };

export async function guardNoConsoleErrors(page: Page, run: () => Promise<void>, testInfo?: TestInfo) {
  const guard = attachConsoleGuards(page);
  await run();
  await expectNoConsoleErrors(guard, testInfo);
}

