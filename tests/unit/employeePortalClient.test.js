// @vitest-environment jsdom
/**
 * Client side of the employee portal (/employee/<slug>): URL rules, per-tab portal context, API header
 * scoping, and the org resolver — which inside a portal resolves ONLY that workforce (never another business,
 * never bootstraps one). Authorization itself is server/DB side (employeePortal.db.test.js).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  employeePortalPath,
  isValidPortalSlug,
  portalSlugFromPath,
  slugifyPortalName,
} from "@shared/workforce/portalSlug.js";

const rpc = vi.fn();
const fromCalls = [];
vi.mock("@/lib/supabaseClient", () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: (...args) => rpc(...args),
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    from: (table) => {
      fromCalls.push(table);
      const b = {
        select: () => b,
        eq: () => b,
        order: () => b,
        limit: () => b,
        maybeSingle: async () =>
          table === "organizations" ? { data: { id: OWN_ORG }, error: null } : { data: null, error: null },
      };
      return b;
    },
  },
}));
vi.mock("@/lib/orgBootstrapApi", () => ({
  clearOrgBootstrapInflight: () => {},
  runOrgBootstrapWithLock: vi.fn(async () => {
    throw new Error("bootstrap must not run inside a portal");
  }),
  getOrgBootstrapCircuitOpenUntil: () => 0,
  recordOrgBootstrapFailure: () => {},
}));
vi.mock("@/api/auth/authSessionHelpers.js", () => ({
  getSessionWithRetry: async () => ({ data: { session: { user: { id: USER }, access_token: "t" } } }),
  isSupabaseAuthUuid: () => true,
}));
vi.mock("@/api/entity/entityShared.js", () => ({ assertSessionAuthorityAllowsMutations: () => {} }));

const USER = "b0000000-0000-4000-8000-000000000001";
const OWN_ORG = "b0000000-0000-4000-8000-0000000000bb";
const EMPLOYER_ORG = "a0000000-0000-4000-8000-0000000000aa";

const portalState = await import("@/lib/workforcePortal/portalState.js");
const { clearOrgIdCache, resolveActiveOrgIdForUser } = await import("@/api/auth/orgCache.js");
const { ensureUserHasOrganization } = await import("@/api/auth/ensureUserOrganization.js");
const { shouldPersistReactQueryKey } = await import("@/lib/paidlyPersistedQueryRootKeys.js");

beforeEach(() => {
  sessionStorage.clear();
  clearOrgIdCache();
  rpc.mockReset();
  fromCalls.length = 0;
});

describe("portal URL rules", () => {
  it("slugs are lowercase, URL-safe, bounded, never reserved or id-shaped", () => {
    expect(slugifyPortalName("Padosio")).toBe("padosio");
    expect(slugifyPortalName("Padosio Restaurant & Events")).toBe("padosio-restaurant-events");
    expect(slugifyPortalName("Café Zoë & Co.")).toBe("cafe-zoe-co");
    for (const ok of ["padosio", "abc", "a-b-c", "padosio-2"]) expect(isValidPortalSlug(ok), ok).toBe(true);
    for (const bad of ["Padosio", "ab", "-a", "a-", "a--b", "a b", "a_b", "../x", "admin", "login", "api", "settings",
      "a".repeat(49), OWN_ORG, 42, null]) {
      expect(isValidPortalSlug(bad), String(bad)).toBe(false);
    }
  });

  it("public URL carries only the slug", () => {
    expect(employeePortalPath("padosio", "https://paidly.co.za/")).toBe("https://paidly.co.za/employee/padosio");
    expect(employeePortalPath(OWN_ORG)).toBe("");
    expect(employeePortalPath("admin")).toBe("");
    expect(portalSlugFromPath("/employee/Padosio")).toBe("padosio");
    expect(portalSlugFromPath("/employee/padosio/extra")).toBe("");
    expect(portalSlugFromPath(`/employee/${OWN_ORG}`)).toBe("");
  });
});

describe("per-tab portal context + API header", () => {
  it("defaults to the user's own business context", () => {
    expect(portalState.getActivePortalSlug()).toBe("");
    expect(portalState.portalContextKey()).toBe("default");
    expect(portalState.withPortalHeader("/api/workforce/me", undefined)).toBeUndefined();
  });

  it("inside a portal, Paidly API calls carry X-Paidly-Portal — third parties never do", () => {
    portalState.setActivePortalSlug("padosio");
    const h = portalState.withPortalHeader("/api/workforce/me", { Authorization: "Bearer x" });
    expect(h.get("x-paidly-portal")).toBe("padosio");
    expect(h.get("authorization")).toBe("Bearer x");
    expect(new Headers(portalState.withPortalHeader(`${window.location.origin}/api/pos/sale`, {})).get("x-paidly-portal"))
      .toBe("padosio");
    expect(portalState.withPortalHeader("https://evil.example/api/x", {})).toEqual({});
    expect(portalState.withPortalHeader("/assets/logo.png", {})).toEqual({});
  });

  it("refuses to store an invalid slug", () => {
    expect(() => portalState.setActivePortalSlug("admin")).toThrow();
    sessionStorage.setItem("paidly.workforce_portal.v1", "../../x");
    expect(portalState.getActivePortalSlug()).toBe("");
  });
});

describe("org resolution", () => {
  it("default context: the business the user owns", async () => {
    expect(await resolveActiveOrgIdForUser(USER)).toBe(OWN_ORG);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("inside /employee/padosio: the employer org verified by the database", async () => {
    portalState.setActivePortalSlug("padosio");
    rpc.mockResolvedValue({ data: { ok: true, org_id: EMPLOYER_ORG }, error: null });
    expect(await resolveActiveOrgIdForUser(USER)).toBe(EMPLOYER_ORG);
    expect(rpc).toHaveBeenCalledWith("resolve_my_workforce_portal", { p_slug: "padosio" });
    expect(fromCalls).not.toContain("organizations"); // never looked at the owned business
  });

  it("denied portal → null, never the owned business; ensureUserHasOrganization refuses, no bootstrap", async () => {
    portalState.setActivePortalSlug("another-company");
    rpc.mockResolvedValue({ data: { ok: false, reason: "no_employment" }, error: null });
    expect(await resolveActiveOrgIdForUser(USER)).toBeNull();
    await expect(ensureUserHasOrganization(USER)).rejects.toMatchObject({ code: "PORTAL_ACCESS_DENIED" });
  });

  it("the org cache is per context: leaving the portal resolves the owned business again", async () => {
    portalState.setActivePortalSlug("padosio");
    rpc.mockResolvedValue({ data: { ok: true, org_id: EMPLOYER_ORG }, error: null });
    expect(await ensureUserHasOrganization(USER)).toBe(EMPLOYER_ORG);
    portalState.clearActivePortalSlug();
    expect(await ensureUserHasOrganization(USER)).toBe(OWN_ORG);
  });
});

describe("persisted caches", () => {
  it("portal tabs never persist or hydrate query snapshots", () => {
    expect(shouldPersistReactQueryKey(["dashboard", "invoices", USER])).toBe(true);
    portalState.setActivePortalSlug("padosio");
    expect(shouldPersistReactQueryKey(["dashboard", "invoices", USER])).toBe(false);
    expect(shouldPersistReactQueryKey(["invoices"])).toBe(false);
  });
});
