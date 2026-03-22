import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const AUTH_DIR = path.join(process.cwd(), 'playwright', '.auth');
const STORAGE_STATE_PATH = path.join(AUTH_DIR, 'user.json');

function pickEnv(primary: string, alias: string): string | undefined {
  const a = process.env[primary]?.trim();
  if (a) return a;
  const b = process.env[alias]?.trim();
  return b || undefined;
}

setup('authenticate (global)', async ({ page, baseURL }) => {
  const email = pickEnv('E2E_EMAIL', 'E2E_USER_EMAIL');
  const password = pickEnv('E2E_PASSWORD', 'E2E_USER_PASSWORD');
  if (!email || !password) {
    throw new Error(
      'Missing E2E_EMAIL / E2E_PASSWORD (or E2E_USER_EMAIL / E2E_USER_PASSWORD). Set in shell or CI secrets — never commit real passwords.'
    );
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });

  await page.goto(`${baseURL}/Login`, { waitUntil: 'domcontentloaded' });

  // Login page assertions (web-first)
  await expect(page).toHaveURL(/\/Login/i);
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  // /Login shows waitlist + login modal; avoid ambiguous input[type="email"].
  await page.locator('#landing-login-email').fill(email);
  const passwordInput = page.locator('#landing-login-password');
  await expect(passwordInput).toBeVisible();
  await passwordInput.fill(password);

  await page.getByRole('button', { name: /^sign in$/i }).click();

  // Successful login should leave /Login and land on a protected area (commonly /Dashboard).
  await page.waitForURL((url) => !/\/Login/i.test(url.toString()), { timeout: 30_000 });

  // Persist auth for all tests.
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});

