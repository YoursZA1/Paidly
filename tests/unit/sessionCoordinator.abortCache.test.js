import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
    },
  },
}));

vi.mock("@/stores/authSessionStore", () => ({
  useAuthSessionStore: {
    getState: () => ({ session: null }),
  },
}));

describe("SessionCoordinator abort snapshot", () => {
  beforeEach(() => {
    vi.resetModules();
    getSession.mockReset();
  });

  it("does not reuse an aborted getSession result for the next caller", async () => {
    const abortErr = { name: "AbortError", message: "signal is aborted without reason" };
    getSession
      .mockResolvedValueOnce({ data: { session: null }, error: abortErr })
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: "tok",
            refresh_token: "ref",
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            user: { id: "u1" },
          },
        },
        error: null,
      });

    const { getStableSessionResult, invalidateSessionSnapshot } = await import(
      "@/core/auth/SessionCoordinator"
    );
    invalidateSessionSnapshot();

    const first = await getStableSessionResult();
    expect(first.error).toEqual(abortErr);

    const second = await getStableSessionResult();
    expect(second.data.session?.user?.id).toBe("u1");
    expect(getSession).toHaveBeenCalledTimes(2);
  });
});
