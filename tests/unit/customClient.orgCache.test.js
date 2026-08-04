import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: true,
}));

vi.mock("@/utils/apiRequest", () => ({
  apiRequestJson: vi.fn(),
}));

/** PostgREST-style fluent builder; each terminal resolves to `{ data, error }`. */
function fluentQuery(terminalResult) {
  const chain = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);
  chain.single = vi.fn().mockResolvedValue(terminalResult);
  return chain;
}

describe("EntityManager org cache behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );
    mockSupabase.auth.getSession.mockReset();
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.from.mockReset();
  });

  it("does not cache org_id under requested user on session mismatch", async () => {
    const requestedUserId = "11111111-1111-4111-8111-111111111111";
    const sessionUserId = "22222222-2222-4222-8222-222222222222";

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: sessionUserId } },
      error: null,
    });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: sessionUserId },
          access_token: "test-access-token",
        },
      },
      error: null,
    });

    mockSupabase.from.mockImplementation((table) => {
      if (table === "profiles") {
        return fluentQuery({
          data: { company_name: "Org", full_name: "Owner" },
          error: null,
        });
      }
      if (table === "memberships") {
        return fluentQuery({
          data: { org_id: "org-123" },
          error: null,
        });
      }
      // Owner-first resolveActiveOrgIdForUser hits organizations before memberships.
      if (table === "organizations") {
        return fluentQuery({ data: { id: "org-123" }, error: null });
      }
      return fluentQuery({ data: null, error: null });
    });

    const { createClient } = await import("@/api/customClient");
    const client = createClient({ appId: "test", requiresAuth: true });
    const manager = client.entities.Client;

    const first = await manager.ensureUserHasOrganization(requestedUserId);
    const second = await manager.ensureUserHasOrganization(requestedUserId);

    expect(first).toBe("org-123");
    expect(second).toBe("org-123");
    // Org present: server bootstrap is not called; second call uses session-user cache.
    expect(globalThis.fetch).toHaveBeenCalledTimes(0);
    const orgCalls = mockSupabase.from.mock.calls.filter((c) => c[0] === "organizations");
    expect(orgCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("calls bootstrap API once when membership is missing, then uses org_id", async () => {
    const sessionUserId = "33333333-3333-4333-8333-333333333333";

    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: sessionUserId } },
      error: null,
    });
    mockSupabase.auth.getSession.mockResolvedValue({
      data: {
        session: {
          user: { id: sessionUserId },
          access_token: "tok",
        },
      },
      error: null,
    });

    let membershipPass = 0;
    mockSupabase.from.mockImplementation((table) => {
      if (table === "organizations") {
        // No owned org — fall through to membership / bootstrap.
        return fluentQuery({ data: null, error: null });
      }
      if (table === "memberships") {
        membershipPass += 1;
        const orgId = membershipPass >= 3 ? "org-from-boot" : null;
        return fluentQuery({
          data: orgId ? { org_id: orgId } : null,
          error: null,
        });
      }
      return fluentQuery({ data: null, error: null });
    });

    const { apiRequestJson } = await import("@/utils/apiRequest");
    apiRequestJson.mockResolvedValue({ ok: true, org_id: "org-from-boot" });

    const { createClient } = await import("@/api/customClient");
    const client = createClient({ appId: "test", requiresAuth: true });
    const manager = client.entities.Client;

    const orgId = await manager.ensureUserHasOrganization(sessionUserId);
    expect(orgId).toBe("org-from-boot");
    expect(apiRequestJson).toHaveBeenCalledTimes(1);
    expect(String(apiRequestJson.mock.calls[0][0])).toContain("/api/auth/bootstrap-user");
  });
});
