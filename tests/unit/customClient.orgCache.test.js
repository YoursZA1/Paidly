import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: true,
}));

function buildProfileQuery(profileRow) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: profileRow, error: null }),
  };
}

describe("EntityManager org cache behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupabase.auth.getSession.mockReset();
    mockSupabase.auth.getUser.mockReset();
    mockSupabase.from.mockReset();
    mockSupabase.rpc.mockReset();
  });

  it("does not cache org_id under requested user on session mismatch", async () => {
    const requestedUserId = "11111111-1111-4111-8111-111111111111";
    const sessionUserId = "22222222-2222-4222-8222-222222222222";

    mockSupabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: sessionUserId } } },
      error: null,
    });
    mockSupabase.from.mockReturnValue(buildProfileQuery({ company_name: "Org", full_name: "Owner" }));
    mockSupabase.rpc.mockResolvedValue({
      data: "org-123",
      error: null,
    });

    const { createClient } = await import("@/api/customClient");
    const client = createClient({ appId: "test", requiresAuth: true });
    const manager = client.entities.Client;

    const first = await manager.ensureUserHasOrganization(requestedUserId);
    const second = await manager.ensureUserHasOrganization(requestedUserId);

    expect(first).toBe("org-123");
    expect(second).toBe("org-123");
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
  });
});
