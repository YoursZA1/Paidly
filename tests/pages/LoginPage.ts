import { expect, type Page, type Locator } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly signInButton: Locator;
  readonly showPasswordButton: Locator;
  readonly forgotPasswordButton: Locator;
  readonly createAccountButton: Locator;
  readonly googleButton: Locator;
  readonly appleButton: Locator;

  constructor(page: Page) {
    this.page = page;
    // On localhost the Email label is not reliably wired to the input; prefer type=email.
    this.email = page.locator('input[type="email"]');
    this.password = page.locator('input[type="password"]');
    this.signInButton = page.getByRole('button', { name: /^sign in$/i });
    this.showPasswordButton = page.getByRole('button', { name: /show password/i });
    this.forgotPasswordButton = page.getByRole('button', { name: /forgot your password/i });
    this.createAccountButton = page.getByRole('button', { name: /create one/i });
    this.googleButton = page.getByRole('button', { name: /^google$/i });
    this.appleButton = page.getByRole('button', { name: /^apple$/i });
  }

  async goto(baseURL: string) {
    await this.page.goto(`${baseURL}/Login`, { waitUntil: 'domcontentloaded' });
    await expect(this.page).toHaveURL(/\/Login/i);
    await expect(this.signInButton).toBeVisible();
  }

  async login(email: string, password: string) {
    await expect(this.email).toBeVisible();
    await this.email.fill(email);
    await expect(this.password).toBeVisible();
    await this.password.fill(password);
    await this.signInButton.click();
  }
}

