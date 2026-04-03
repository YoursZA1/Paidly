import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({ supabase: mockSupabase }));

/**
 * `maybeSingle()` resolves to `{ data, error }` like @supabase/supabase-js.
 * @param {{ data: unknown, error: unknown }} row
 */
function createAffiliateRowQueryBuilder(row) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(row),
  };
}

describe("parseSignupReferralRef", () => {
  it("prefers ?ref= in search params", async () => {
    const { parseSignupReferralRef } = await import("@/api/affiliateClient");
    const sp = new URLSearchParams("ref=FROMQUERY");
    const params = { get: (k) => sp.get(k) };
    expect(parseSignupReferralRef(params, "#sign-up?ref=IGNORED")).toBe("FROMQUERY");
  });

  it("parses legacy hash sign-up?ref=", async () => {
    const { parseSignupReferralRef } = await import("@/api/affiliateClient");
    const params = { get: () => null };
    expect(parseSignupReferralRef(params, "#sign-up?ref=LEGACY")).toBe("LEGACY");
  });

  it("returns null when absent", async () => {
    const { parseSignupReferralRef } = await import("@/api/affiliateClient");
    expect(parseSignupReferralRef({ get: () => null }, "")).toBe(null);
    expect(parseSignupReferralRef({ get: () => null }, "#sign-up")).toBe(null);
  });

  it("truncates overly long ref values", async () => {
    const { parseSignupReferralRef, MAX_SIGNUP_REFERRAL_CODE_LEN } = await import("@/api/affiliateClient");
    const long = "x".repeat(MAX_SIGNUP_REFERRAL_CODE_LEN + 40);
    const sp = new URLSearchParams(`ref=${encodeURIComponent(long)}`);
    const params = { get: (k) => sp.get(k) };
    const out = parseSignupReferralRef(params, "");
    expect(out?.length).toBe(MAX_SIGNUP_REFERRAL_CODE_LEN);
  });
});

describe("fetchAffiliateDashboardData", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_NODE_AFFILIATE_API", "1");
    mockSupabase.auth.getSession.mockClear();
    mockSupabase.from.mockClear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const mockSession = {
    data: {
      session: {
        user: { id: "user-123" },
        access_token: "token-abc",
      },
    },
  };

  const mockAffiliate = {
    id: "affiliate-1",
    referral_code: "TESTCODE",
    commission_rate: 0.1,
    status: "approved",
    created_at: "2024-01-01",
  };

  const mockApiResponse = {
    ok: true,
    affiliate: mockAffiliate,
    stats: {
      clicks: 10,
      signups: 5,
      subscribed: 3,
      paidUsers: 2,
      earningsPending: 100,
      earningsPaid: 50,
    },
    summary: { signups: 5, paid_users: 2, earnings: 150 },
    recentCommissions: [
      { id: "c1", amount: 100, status: "pending", created_at: "2024-03-01" },
    ],
  };

  it("fetches data from API when API is available", async () => {
    mockSupabase.auth.getSession.mockResolvedValue(mockSession);
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockApiResponse),
    });

    const { fetchAffiliateDashboardData } = await import("@/api/affiliateClient");
    const result = await fetchAffiliateDashboardData();

    expect(result).toEqual(mockApiResponse);
    expect(global.fetch).toHaveBeenCalled();
  });

  it("falls back to Supabase when API fails", async () => {
    mockSupabase.auth.getSession.mockResolvedValue(mockSession);
    global.fetch.mockRejectedValue(new Error("Network error"));

    const mockClicksRes = {
      data: null,
      error: null,
      count: 10,
    };

    const mockReferralsRes = {
      data: [
        { id: "ref-1", status: "signed_up" },
        { id: "ref-2", status: "subscribed" },
        { id: "ref-3", status: "pending" },
      ],
      error: null,
    };

    const mockCommissionsRes = {
      data: [
        { id: "c1", amount: 100, status: "pending", created_at: "2024-03-01" },
        { id: "c2", amount: 50, status: "approved", created_at: "2024-02-28" },
      ],
      error: null,
    };

    const affiliateQueryBuilder = createAffiliateRowQueryBuilder({
      data: mockAffiliate,
      error: null,
    });

    const clicksQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue(mockClicksRes),
    };

    const referralsQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue(mockReferralsRes),
    };

    const commissionsQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(mockCommissionsRes),
    };

    mockSupabase.from
      .mockReturnValueOnce(affiliateQueryBuilder)
      .mockReturnValueOnce(clicksQueryBuilder)
      .mockReturnValueOnce(referralsQueryBuilder)
      .mockReturnValueOnce(commissionsQueryBuilder);

    const { fetchAffiliateDashboardData } = await import("@/api/affiliateClient");
    const result = await fetchAffiliateDashboardData();

    expect(result.ok).toBe(true);
    expect(result.affiliate).toEqual(mockAffiliate);
    expect(result.stats.clicks).toBe(10);
    expect(result.stats.signups).toBe(2);
  });

  it("returns error when both API and Supabase fail", async () => {
    mockSupabase.auth.getSession.mockResolvedValue(mockSession);
    global.fetch.mockRejectedValue(new Error("Network error"));

    const affiliateQueryBuilder = createAffiliateRowQueryBuilder({
      data: null,
      error: { message: "DB error" },
    });

    mockSupabase.from.mockReturnValue(affiliateQueryBuilder);

    const { fetchAffiliateDashboardData } = await import("@/api/affiliateClient");
    const result = await fetchAffiliateDashboardData();

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns error when no session", async () => {
    mockSupabase.auth.getSession.mockResolvedValue({ session: null });

    const { fetchAffiliateDashboardData } = await import("@/api/affiliateClient");
    const result = await fetchAffiliateDashboardData();

    expect(result.ok).toBe(false);
    expect(result.error).toBe("no_session");
  });

  it("returns empty stats when affiliate not found in Supabase fallback", async () => {
    mockSupabase.auth.getSession.mockResolvedValue(mockSession);
    global.fetch.mockRejectedValue(new Error("API down"));

    const affiliateQueryBuilder = createAffiliateRowQueryBuilder({
      data: null,
      error: null,
    });

    mockSupabase.from.mockReturnValue(affiliateQueryBuilder);

    const { fetchAffiliateDashboardData } = await import("@/api/affiliateClient");
    const result = await fetchAffiliateDashboardData();

    expect(result.ok).toBe(true);
    expect(result.affiliate).toBeNull();
    expect(result.stats.clicks).toBe(0);
    expect(result.stats.signups).toBe(0);
  });
});
