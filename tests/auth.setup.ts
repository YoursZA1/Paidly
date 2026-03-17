import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Set it in your shell or CI secrets (do not hardcode credentials in the repo).`
    );
  }
  return v;
}

setup('authenticate (global)', async ({ page, baseURL }) => {
  const email = requireEnv('E2E_EMAIL');
  const password = requireEnv('E2E_PASSWORD');

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto(`${baseURL}/Login`, { waitUntil: 'domcontentloaded' });

  // Login page assertions (web-first)
  await expect(page).toHaveURL(/\/Login/i);
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  // Use accessible roles when possible; fall back to type=password locator.
  await page.locator('input[type="email"]').fill(email);
  const passwordInput = page.locator('input[type="password"]');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Successful login should leave /Login and land on a protected area (commonly /Dashboard).
  await page.waitForURL((url) => !/\/Login/i.test(url.toString()), { timeout: 30_000 });

  // Persist auth for all tests.
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});

