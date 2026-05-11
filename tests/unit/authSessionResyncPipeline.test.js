import { describe, expect, it, vi } from "vitest";
import { runSessionRefreshExecutorPipeline } from "@/lib/auth/authSessionResyncPipeline";

describe("runSessionRefreshExecutorPipeline", () => {
  it("short-circuits downstream work when refresh is fatal", async () => {
    const refreshSession = vi.fn(async () => ({ status: "fatal", reason: "refresh_token_invalid" }));
    const refreshUser = vi.fn(async () => {});
    const afterProfileHydrated = vi.fn(async () => {});

    const result = await runSessionRefreshExecutorPipeline({
      silent: true,
      bypassThrottle: false,
      refreshSession,
      refreshUser,
      afterProfileHydrated,
    });

    expect(result).toEqual({ status: "fatal", reason: "refresh_token_invalid" });
    expect(refreshUser).not.toHaveBeenCalled();
    expect(afterProfileHydrated).not.toHaveBeenCalled();
  });

  it("runs downstream work only on successful refresh", async () => {
    const refreshSession = vi.fn(async () => ({ status: "success" }));
    const refreshUser = vi.fn(async () => {});
    const afterProfileHydrated = vi.fn(async () => {});

    const result = await runSessionRefreshExecutorPipeline({
      silent: true,
      bypassThrottle: false,
      refreshSession,
      refreshUser,
      afterProfileHydrated,
    });

    expect(result).toEqual({ status: "success" });
    expect(refreshUser).toHaveBeenCalledTimes(1);
    expect(afterProfileHydrated).toHaveBeenCalledTimes(1);
  });
});
