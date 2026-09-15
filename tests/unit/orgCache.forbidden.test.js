import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  from: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: mockSupabase,
}));

vi.mock("@/lib/orgBootstrapApi", () => ({
  clearOrgBootstrapInflight: vi.fn(),
}));

function fluentQuery(terminalResult) {
  const chain = {};
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(terminalResult);
  return chain;
}

describe("resolveActiveOrgIdForUser forbidden", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase.from.mockReset();
  });

  it("does not follow up with memberships when organizations returns 403", async () => {
    mockSupabase.from.mockImplementation((table) => {
      if (table === "organizations") {
        return fluentQuery({
          data: null,
          error: { status: 403, message: "permission denied for table organizations" },
        });
      }
      if (table === "memberships") {
        return fluentQuery({
          data: null,
          error: { status: 403, message: "permission denied for table memberships" },
        });
      }
      return fluentQuery({ data: null, error: null });
    });

    const { resolveActiveOrgIdForUser } = await import("@/api/auth/orgCache.js");
    const orgId = await resolveActiveOrgIdForUser("5b72e077-de93-41af-95e5-4e06d7924562");
    expect(orgId).toBeNull();
    expect(mockSupabase.from.mock.calls.map((c) => c[0])).toEqual(["organizations"]);
  });
});
