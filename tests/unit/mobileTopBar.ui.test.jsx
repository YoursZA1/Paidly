/** @vitest-environment jsdom */
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MobileTopBar from "@/components/layout/MobileTopBar";

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ authUserId: null }) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderBar(props = {}) {
  const handlers = { onOpenMenu: vi.fn(), onOpenSearch: vi.fn() };
  await act(async () => {
    root.render(
      <MemoryRouter>
        <MobileTopBar homeHref="/Dashboard" pageLabel="Invoices" showActions accountInitial="N" {...handlers} {...props} />
      </MemoryRouter>
    );
  });
  return handlers;
}

const byLabel = (label) => container.querySelector(`[aria-label="${label}"]`);

describe("MobileTopBar", () => {
  it("labels every control and wires menu and search to the caller", async () => {
    const { onOpenMenu, onOpenSearch } = await renderBar();
    for (const label of ["Open menu", "Paidly home", "Search", "Notifications", "Account menu"]) {
      expect(byLabel(label), label).not.toBeNull();
    }
    await act(async () => byLabel("Open menu").click());
    await act(async () => byLabel("Search").click());
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(byLabel("Paidly home").getAttribute("href")).toBe("/Dashboard");
  });

  it("gives each icon control a 44px minimum touch target", async () => {
    await renderBar();
    for (const label of ["Open menu", "Search", "Account menu"]) {
      const cls = byLabel(label).className;
      expect(cls, label).toMatch(/\bsize-11\b/);
      expect(cls, label).toMatch(/\bmin-h-11\b/);
    }
    expect(byLabel("Notifications").className).toMatch(/\bsize-11\b/);
  });

  it("shows only the menu and brand when signed out", async () => {
    await renderBar({ showActions: false });
    expect(byLabel("Open menu")).not.toBeNull();
    expect(byLabel("Paidly home")).not.toBeNull();
    expect(byLabel("Search")).toBeNull();
    expect(byLabel("Account menu")).toBeNull();
  });
});
