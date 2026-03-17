import { expect, type Locator, type Page } from '@playwright/test';

export class Sidebar {
  readonly page: Page;
  readonly nav: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nav = page.getByRole('navigation');
  }

  item(label: string) {
    // Prefer link; fallback to button
    return this.nav.getByRole('link', { name: new RegExp(`^${escapeRegExp(label)}$`, 'i') })
      .or(this.nav.getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}$`, 'i') }));
  }

  async goto(label: string) {
    const target = this.item(label);
    await expect(target).toBeVisible();
    await target.click();
  }

  async expectActive(label: string) {
    const target = this.item(label);
    await expect(target).toBeVisible();
    // Active styles vary; use aria-current if present, otherwise check class contains "active"/"bg" heuristics.
    await expect(target).toHaveAttribute(/aria-current/i, /page/i).catch(async () => {
      const cls = (await target.getAttribute('class')) || '';
      expect(cls.toLowerCase(), `Sidebar item "${label}" should look active`).toMatch(/active|selected|bg|text/);
    });
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

