import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock("@/lib/supabaseClient", () => ({ supabase: mockSupabase }));

const createMockQueryBuilder = (resolvedValue) => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  count: vi.fn().mockReturnThis(),
  head: vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
});

describe("fetchAffiliateDashboardData", () => {
  beforeEach(() => {
    mockSupabase.auth.getSession.mockClear();
    mockSupabase.from.mockClear();
    global.fetch = vi.fn();
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
      json: async () => mockApiResponse,
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
        { id: "ref-3", status: "paid" },
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

    const affiliateQueryBuilder = createMockQueryBuilder({
      data: mockAffiliate,
      error: null,
    });

    const clicksQueryBuilder = {
      select: vi.fn().mockResolvedValue(mockClicksRes),
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

    const affiliateQueryBuilder = createMockQueryBuilder({
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

    const affiliateQueryBuilder = createMockQueryBuilder({
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
