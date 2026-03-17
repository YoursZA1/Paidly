import { expect, type Page, type TestInfo } from '@playwright/test';

export function attachConsoleGuards(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err?.message || String(err)}`));
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') errors.push(`[console.${type}] ${msg.text()}`);
  });
  return {
    getErrors: () => [...errors],
    clear: () => {
      errors.length = 0;
    },
  };
}

export async function expectNoConsoleErrors(guard: ReturnType<typeof attachConsoleGuards>, testInfo?: TestInfo) {
  const errors = guard.getErrors().filter((e) => !/ResizeObserver loop limit exceeded/i.test(e));
  if (errors.length) {
    if (testInfo) {
      await testInfo.attach('console-errors.txt', { body: errors.join('\n'), contentType: 'text/plain' });
    }
  }
  expect(errors, 'No console/page errors should occur').toEqual([]);
}

export async function expectPageReady(page: Page, opts?: { maxMs?: number }) {
  const maxMs = opts?.maxMs ?? 30_000;
  await page.waitForLoadState('domcontentloaded', { timeout: maxMs });
}

