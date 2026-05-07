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
    // Bootstrap API attempted once per session user; second call skips HTTP and re-queries membership.
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const membershipCalls = mockSupabase.from.mock.calls.filter((c) => c[0] === "memberships");
    expect(membershipCalls.length).toBeGreaterThanOrEqual(2);
  });
});
