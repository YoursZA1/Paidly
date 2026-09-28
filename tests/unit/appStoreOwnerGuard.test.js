// @vitest-environment jsdom
/**
 * The app store is persisted to localStorage. Data fetched for one signed-in user must never be served to
 * another (shared device / session swap without explicit logout) — Layout calls ensureOwner(user.id) first.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/api/entities", () => ({}));
vi.mock("@/services/dashboardBootstrapService", () => ({ fetchDashboardBootstrap: vi.fn() }));

const { useAppStore, appStoreOwnerKey } = await import("@/stores/useAppStore");
const portalState = await import("@/lib/workforcePortal/portalState.js");

const seed = (ownerUserId) =>
  useAppStore.setState({
    invoices: [{ id: "inv-company-a", total_amount: 1000 }],
    payments: [{ id: "pay-company-a", amount: 1000 }],
    userProfile: { id: ownerUserId || "legacy" },
    lastFetchedAt: Date.now(),
    ownerUserId: ownerUserId ? appStoreOwnerKey(ownerUserId) : null,
  });

describe("app store owner guard", () => {
  it("drops another user's persisted business data", () => {
    seed("owner-a");
    useAppStore.getState().ensureOwner("employee-b");
    const s = useAppStore.getState();
    expect(s.invoices).toEqual([]);
    expect(s.payments).toEqual([]);
    expect(s.lastFetchedAt).toBeNull();
    expect(s.ownerUserId).toBeNull();
  });

  it("drops pre-guard persisted data that cannot be attributed to anyone", () => {
    seed(null);
    useAppStore.getState().ensureOwner("employee-b");
    expect(useAppStore.getState().invoices).toEqual([]);
  });

  it("keeps the same user's data (no needless refetch)", () => {
    seed("owner-a");
    useAppStore.getState().ensureOwner("owner-a");
    expect(useAppStore.getState().invoices).toHaveLength(1);
  });

  it("persists the owner stamp alongside the data", () => {
    seed("owner-a");
    const persisted = useAppStore.persist.getOptions().partialize(useAppStore.getState());
    expect(persisted.ownerUserId).toBe("owner-a|default");
  });

  it("same user, different context (own business → employee portal): data is dropped", () => {
    seed("employee-b"); // their own business dashboard data
    portalState.setActivePortalSlug("padosio");
    useAppStore.getState().ensureOwner("employee-b");
    expect(useAppStore.getState().invoices).toEqual([]);
    portalState.clearActivePortalSlug();
  });
});
