import { expect, type Page, type Locator } from '@playwright/test';

export class AppShell {
  readonly page: Page;
  readonly logoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // Footer profile area in Layout mentions logout; use role-based match first.
    this.logoutButton = page.getByRole('button', { name: /logout/i });
  }

  async gotoDashboard(baseURL: string) {
    await this.page.goto(`${baseURL}/Dashboard`, { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveURL(/\/Dashboard/i);
  }
}

