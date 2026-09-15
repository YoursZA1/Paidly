/**
 * Network-sequence coverage for the production login hang.
 *
 * Captured path (not a live HAR; this is the same request order the browser
 * Network tab shows after password auth):
 *
 *   POST /api/auth/sign-in                         200
 *   GoTrue setSession / SIGNED_IN
 *   GET  /auth/v1/session                          aborted (lock)
 *   GET  /rest/v1/profiles?id=eq.<user>            200  ← dashboard gate
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const maybeSingle = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
    from: vi.fn(() => {
      const chain = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.maybeSingle = (...args) => maybeSingle(...args);
      return chain;
    }),
  },
  isSupabaseConfigured: true,
}));

describe("login restore network sequence", () => {
  beforeEach(async () => {
    vi.resetModules();
    getSession.mockReset();
    maybeSingle.mockReset();
    const { useAuthSessionStore } = await import("@/stores/authSessionStore");
    useAuthSessionStore.setState({
      user: null,
      session: null,
      loading: true,
      authLoadingTimedOut: false,
      profileReady: false,
    });
  });

  it("marks profileReady only after profiles returns, not after an aborted getSession", async () => {
    const abortErr = { name: "AbortError", message: "signal is aborted without reason" };
    getSession.mockResolvedValue({ data: { session: null }, error: abortErr });
    maybeSingle.mockResolvedValue({
      data: { id: "u1", full_name: "Ada", email: "a@b.com" },
      error: null,
    });

    const { AuthManager } = await import("@/api/auth/AuthManager.js");
    const mgr = new AuthManager();
    const user = await mgr.restoreFromSupabaseSession({
      user: { id: "u1", email: "a@b.com" },
    });

    expect(user.profileReady).toBe(true);
    expect(user.full_name).toBe("Ada");
    expect(getSession).not.toHaveBeenCalled();
  });

  it("keeps profileReady false when the profiles request is aborted", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { name: "AbortError", message: "signal is aborted without reason" },
    });

    const { AuthManager } = await import("@/api/auth/AuthManager.js");
    const mgr = new AuthManager();
    const user = await mgr.restoreFromSupabaseSession({
      user: { id: "u1", email: "a@b.com" },
    });

    expect(user.profileReady).toBe(false);
    expect(user.id).toBe("u1");
  });

  it("Network tab equivalent: aborted GET /auth/v1/session is not reused; GET /rest/v1/profiles 200 gates the dashboard", async () => {
    const abortErr = { name: "AbortError", message: "signal is aborted without reason" };
    getSession
      .mockResolvedValueOnce({ data: { session: null }, error: abortErr })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "tok",
            refresh_token: "ref",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: "u1", email: "a@b.com" },
          },
        },
        error: null,
      });
    maybeSingle.mockResolvedValue({
      data: { id: "u1", full_name: "Ada", email: "a@b.com" },
      error: null,
    });

    const { getStableSessionResult, invalidateSessionSnapshot } = await import(
      "@/core/auth/SessionCoordinator"
    );
    invalidateSessionSnapshot();

    const aborted = await getStableSessionResult();
    expect(aborted.error).toEqual(abortErr);

    const recovered = await getStableSessionResult();
    expect(recovered.data.session?.user?.id).toBe("u1");

    const { AuthManager } = await import("@/api/auth/AuthManager.js");
    const mgr = new AuthManager();
    const user = await mgr.restoreFromSupabaseSession({
      user: recovered.data.session.user,
    });
    expect(maybeSingle).toHaveBeenCalled();
    expect(user.profileReady).toBe(true);
    expect(user.full_name).toBe("Ada");
  });

  it("treats HTTP 200 with no profile row as ready (missing profile is not a hang)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const { AuthManager } = await import("@/api/auth/AuthManager.js");
    const mgr = new AuthManager();
    const user = await mgr.restoreFromSupabaseSession({
      user: { id: "u1", email: "a@b.com", user_metadata: { full_name: "Ada" } },
    });

    expect(user.profileReady).toBe(true);
    expect(user.id).toBe("u1");
  });
});
