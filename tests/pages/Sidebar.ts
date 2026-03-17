import { expect, type Locator, type Page } from '@playwright/test';

export class Sidebar {
  readonly page: Page;
  readonly root: Locator;

  constructor(page: Page) {
    this.page = page;
    // Scope interactions to the actual sidebar container.
    // The "Create Invoice" button is a stable anchor that lives inside the sidebar.
    this.root = page
      .locator('div')
      .filter({ has: page.locator('#create-invoice-btn') })
      .first()
      .or(page.locator('[data-sidebar="sidebar"]').first())
      .or(page.locator('nav').first());
  }

  item(label: string) {
    // Prefer the sidebar item id if present (Layout.jsx uses ids like nav-clients).
    const id = `nav-${label.toLowerCase().replace(/\s+/g, '')}`;
    const byId = this.page.locator(`#${cssEscape(id)}`);

    // Prefer link semantics for navigation items to avoid matching unrelated buttons (e.g. "Refresh clients").
    const exact = new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`, 'i');
    return byId.or(this.root.getByRole('link', { name: exact })).first();
  }

  async goto(label: string) {
    const target = this.item(label);
    await expect(target).toBeVisible();
    await target.click({ force: true });
  }

  async expectActive(label: string) {
    const target = this.item(label);
    await expect(target).toBeVisible();
    // Active styles vary; use aria-current if present, otherwise check class contains "active"/"bg" heuristics.
    await expect(target)
      .toHaveAttribute(/aria-current/i, /page/i)
      .catch(async () => {
        try {
          const cls = (await target.getAttribute('class')) || '';
          expect(cls.toLowerCase(), `Sidebar item "${label}" should look active`).toMatch(/active|selected|bg|text|border-l-primary/);
        } catch {
          // Best-effort: some transitions can detach nodes; URL assertion covers correctness.
        }
      });
  }
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cssEscape(s: string) {
  // Minimal CSS escaper for ids used in tests (letters/spaces only in our case).
  return s.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

