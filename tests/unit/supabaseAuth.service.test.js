import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSupabase = {
  auth: {
    signUp: vi.fn(),
    resend: vi.fn(),
    signInWithPassword: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    getUser: vi.fn(),
  },
};

const { backendPost } = vi.hoisted(() => ({
  backendPost: vi.fn(),
}));

vi.mock("@/api/backendClient", () => ({
  backendApi: { post: backendPost },
  isProductionBackendUrlLocalhost: () => false,
}));

vi.mock("@/lib/supabaseClient", () => ({ supabase: mockSupabase }));

describe("SupabaseAuthService (mocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("error handling", () => {
    it("signInWithEmail throws with normalized message on auth error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      backendPost.mockResolvedValue({
        status: 401,
        data: { error: "Invalid login credentials" },
        headers: {},
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
      backendPost.mockResolvedValue({
        status: 200,
        data: {
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          user: session.user,
        },
        headers: {},
      });
      mockSupabase.auth.setSession.mockResolvedValue({ data: { session }, error: null });
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session },
        error: null,
      });
      const out = await SupabaseAuthService.signInWithEmail("a@b.com", "pass");
      expect(out).toMatchObject({
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: 123,
        user: session.user,
      });
      expect(backendPost).toHaveBeenCalled();
    });

    it("signOut resolves when no error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.signOut.mockResolvedValue({ error: null });
      await expect(SupabaseAuthService.signOut()).resolves.toBeUndefined();
    });

    it("signUpWithEmail returns session and user via API proxy", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      const user = { id: "uid", email: "n@e.com" };
      const session = {
        access_token: "a",
        refresh_token: "r",
        expires_at: 99,
        user,
      };
      backendPost.mockResolvedValue({
        status: 200,
        data: {
          user,
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          },
        },
        headers: {},
      });
      mockSupabase.auth.setSession.mockResolvedValue({ data: { session }, error: null });
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session },
        error: null,
      });
      const out = await SupabaseAuthService.signUpWithEmail("n@e.com", "password12345", { full_name: "N" });
      expect(out.session).toMatchObject({
        accessToken: "a",
        refreshToken: "r",
        expiresAt: 99,
        user,
      });
      expect(out.user).toEqual(user);
      expect(backendPost).toHaveBeenCalledWith(
        "/api/auth/sign-up",
        expect.objectContaining({ email: "n@e.com", password: "password12345" }),
        expect.any(Object)
      );
    });

    it("resendSignupEmail resolves when no error", async () => {
      const { default: SupabaseAuthService } = await import("@/services/SupabaseAuthService");
      mockSupabase.auth.resend.mockResolvedValue({ error: null });
      await expect(SupabaseAuthService.resendSignupEmail("n@e.com")).resolves.toBe(true);
      expect(mockSupabase.auth.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "n@e.com",
      });
    });
  });
});
