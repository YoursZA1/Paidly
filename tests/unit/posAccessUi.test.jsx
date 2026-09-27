/** @vitest-environment jsdom */
/**
 * /pos entry UI (no Paidly login), POS-only boundary on dashboard routes, recent shifts, providers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const state = vi.hoisted(() => ({
  rememberedTill: "",
  posToken: "",
  unlock: null,
  sessions: [],
  providers: null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, session: null, loading: false, profileReady: false, authReady: true, login: async () => {} }),
}));
vi.mock("@/lib/pos/posAccessClient", () => ({
  fetchPosAccess: async () => null,
  getRememberedTillId: () => state.rememberedTill,
  getPosAccessToken: () => state.posToken,
  fetchTillInfo: async (id) => (id ? { ok: true, till: { id, name: "Main Till" }, business: { name: "CoffeeShop" } } : null),
  unlockTillWithCode: async (tillId, code) => state.unlock(tillId, code),
}));
vi.mock("@/services/PosIntegrationService", () => ({
  listPosSessions: async ({ limit } = {}) => state.sessions.slice(0, limit || 100),
  listPosRegisters: async () => ({ registers: [{ id: "t1", name: "Main Till" }] }),
  listPosProviders: async () => state.providers,
  listPosConnections: async () => [],
  getPosOAuthStatus: async () => ({ square: { configured: true } }),
  connectYocoPos: async () => ({}),
  startSquareOAuthConnect: async () => ({}),
  updatePosConnection: async () => ({}),
  deletePosConnection: async () => ({}),
  requestCustomPosProvider: async () => ({}),
  archiveCustomPosProvider: async () => ({}),
  openPosSession: async () => ({}),
}));
vi.mock("@/stores/sessionHealthStore", () => ({ useSessionHealthStore: (sel) => sel({ status: "healthy" }), isTerminalSessionStatus: () => false }));
vi.mock("@/stores/authSessionStore", () => ({ useAuthSessionStore: (sel) => (sel ? sel({}) : {}), patchAuthSession: () => {} }));

const { default: PosAccess } = await import("@/pages/PosAccess");
const { default: RequireAuth } = await import("@/components/auth/RequireAuth");
const { default: PosCodeEntry } = await import("@/components/pos/PosCodeEntry");
const { default: PosRecentShifts } = await import("@/components/settings/PosRecentShifts");
const { default: PosIntegrationSettings } = await import("@/components/settings/PosIntegrationSettings");
const { POS_PROVIDER_OPTIONS } = await import("@shared/pos/posProviderCatalog.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let container;
let root;
beforeEach(() => {
  state.rememberedTill = "";
  state.posToken = "";
  state.sessions = [];
  state.unlock = async () => ({ ok: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

async function render(ui, path = "/pos") {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);
  });
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}
const text = () => document.body.textContent.replace(/\s+/g, " ");
const posRoutes = (
  <Routes>
    <Route path="/pos/till/:tillId" element={<PosAccess />} />
    <Route path="/pos" element={<PosAccess />} />
    <Route path="/dashboard" element={<RequireAuth><p>DASHBOARD</p></RequireAuth>} />
  </Routes>
);

describe("/pos without a Paidly login", () => {
  it("a till link shows the till's code screen — not the email/password login", async () => {
    await render(posRoutes, "/pos/till/aaaaaaaa-1111-4000-8000-000000000001");
    const t = text();
    expect(t).toContain("Paidly POS");
    expect(t).toContain("Main Till");
    expect(t).toContain("CoffeeShop");
    expect(t).toContain("Enter POS access code");
    expect(document.querySelector('input[type="email"]')).toBeNull();
    expect(document.querySelector('input[autocomplete="current-password"]')).toBeNull();
  });

  it("bare /pos on a device that used a till goes straight to that till", async () => {
    state.rememberedTill = "aaaaaaaa-1111-4000-8000-000000000001";
    await render(posRoutes, "/pos");
    expect(text()).toContain("Enter POS access code");
  });

  it("bare /pos on a new device asks for the till link, with owner sign-in only as a secondary option", async () => {
    await render(posRoutes, "/pos");
    expect(text()).toContain("Open your till link");
    expect(document.querySelector('input[type="email"]')).toBeNull();
    expect(text()).toContain("Owner or manager? Sign in with Paidly");
  });

  it("a till session on a dashboard route stays in POS ('POS access only')", async () => {
    state.posToken = "tok";
    await render(posRoutes, "/dashboard");
    expect(text()).toContain("POS access only");
    expect(text()).not.toContain("DASHBOARD");
    expect(document.querySelector('a[href="/pos"]')).not.toBeNull();
  });
});

describe("PosCodeEntry", () => {
  it("submits a 6-digit code and reports the unlocked session", async () => {
    const calls = [];
    state.unlock = async (tillId, code) => {
      calls.push([tillId, code]);
      return { ok: true, auth_method: "code" };
    };
    const onUnlocked = vi.fn();
    await render(<PosCodeEntry tillId="till-1" onUnlocked={onUnlocked} />);
    for (const d of "482913") {
      await act(async () => document.querySelector(`button[aria-label="${d}"]`).click());
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(calls).toEqual([["till-1", "482913"]]);
    expect(onUnlocked).toHaveBeenCalledWith({ ok: true, auth_method: "code" });
  });

  it("shows a generic error and clears the code when it's wrong", async () => {
    state.unlock = async () => {
      throw new Error("That code is not valid for this till.");
    };
    await render(<PosCodeEntry tillId="till-1" onUnlocked={() => {}} />);
    const input = document.getElementById("pos-access-code");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, "111112");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(text()).toContain("That code is not valid for this till.");
    expect(input.value).toBe("");
  });
});

describe("recent shifts", () => {
  const shift = (i, status) => ({
    id: `s${i}`,
    status,
    register_id: "t1",
    register_name: "Main Till",
    opened_by_name: i % 2 ? "Mando" : "Thabo",
    opened_at: new Date(Date.now() - i * 3600e3).toISOString(),
    closed_at: status === "closed" ? new Date(Date.now() - i * 3600e3 + 1800e3).toISOString() : null,
    cash_sales: 100 * i,
  });

  it("shows only the latest 3, with the full history behind 'View all shifts'", async () => {
    state.sessions = Array.from({ length: 12 }, (_, i) => shift(i + 1, i === 0 ? "open" : "closed"));
    await render(<PosRecentShifts />);
    expect(document.querySelectorAll("ul li")).toHaveLength(3);
    const viewAll = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("View all shifts"));
    await act(async () => viewAll.click());
    for (let i = 0; i < 3; i += 1) await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(text()).toContain("All shifts");
    expect(text()).toContain("12 shifts");
  });
});

describe("payment provider section", () => {
  it("shows nothing as connected when nothing is, and never marks Ozow as the default", async () => {
    state.providers = {
      providers: POS_PROVIDER_OPTIONS.map((p) => ({ ...p, status: p.id === "paidly_pay" ? "coming_soon" : p.connect === "platform" ? "unavailable" : "not_connected" })),
      custom: [{ id: "c1", provider_name: "PayFast", method: "online_eft", status: "requested", connected: false }],
      not_supported: {},
    };
    await render(<PosIntegrationSettings />);
    const t = text();
    expect(t).toContain("Connect provider");
    expect(t).not.toMatch(/Ozow\s*·?\s*Instant EFT.*Connected/);
    expect(t).not.toContain("Not configured");
    expect(t).toContain("Requested — not connected");
    expect(t).not.toMatch(/\bConnected\b/);
  });
});
