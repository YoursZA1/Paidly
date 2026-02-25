import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
  },
};

vi.mock("@/lib/supabaseClient", () => ({ supabase: mockSupabase }));

describe("SupabaseAuthService (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("signInWithEmail throws with normalized message on auth error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: null,
        error: { message: "Invalid login credentials" },
      });
      await expect(SupabaseAuthService.signInWithEmail("a@b.com", "wrong")).rejects.toThrow(
        "Invalid login credentials"
      );
    });

    it("signOut throws with normalized message on error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.signOut.mockResolvedValue({
        error: { message: "Sign out failed" },
      });
      await expect(SupabaseAuthService.signOut()).rejects.toThrow("Sign out failed");
    });

    it("getSession throws on error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: "Session fetch failed" },
      });
      await expect(SupabaseAuthService.getSession()).rejects.toThrow("Session fetch failed");
    });
  });

  describe("success paths", () => {
    it("signInWithEmail returns normalized session on success", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      const session = {
        access_token: "tok",
        refresh_token: "ref",
        expires_at: 123,
        user: { id: "u1", email: "a@b.com" },
      };
      mockSupabase.auth.signInWithPassword.mockResolvedValue({ data: { session }, error: null });
      const out = await SupabaseAuthService.signInWithEmail("a@b.com", "pass");
      expect(out).toMatchObject({
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: 123,
        user: session.user,
      });
    });

    it("signOut resolves when no error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });
      await expect(SupabaseAuthService.signOut()).resolves.toBeUndefined();
    });
  });
});
