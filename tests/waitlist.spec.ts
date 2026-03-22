import { test, expect } from '@playwright/test';

/**
 * POST /api/waitlist — hits the same origin as the app when using Vite proxy (localhost:5173 → API),
 * or a full API URL in CI/staging.
 *
 * Set PLAYWRIGHT_WAITLIST_API_URL (no trailing slash) to e.g. https://api.paidly.co.za
 * when the UI and API are on different hosts.
 */
function waitlistPostUrl(): string {
  const explicit = (process.env.PLAYWRIGHT_WAITLIST_API_URL || '').trim().replace(/\/$/, '');
  if (explicit) return `${explicit}/api/waitlist`;
  const base = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173').trim().replace(/\/$/, '');
  return `${base}/api/waitlist`;
}

test.describe('WAITLIST API', () => {
  test('accepts a valid email (200)', async ({ request }) => {
    const url = waitlistPostUrl();
    const email = `e2e.waitlist.${Date.now()}@example.com`;
    const res = await request.post(url, {
      data: { email, name: 'Playwright', source: 'e2e' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(
      res.status(),
      `POST ${url} — set PLAYWRIGHT_WAITLIST_API_URL if API is not proxied from the app origin`
    ).toBe(200);
    const body = await res.json().catch(() => ({}));
    expect(body).toMatchObject({ ok: true });
  });
});
