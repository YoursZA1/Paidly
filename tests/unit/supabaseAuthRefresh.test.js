import { describe, expect, it } from "vitest";
import {
  isRefreshTokenFatalError,
  msUntilProactiveRefresh,
  PROACTIVE_REFRESH_BUFFER_SEC,
} from "../../src/lib/supabaseAuthRefresh.js";

describe("isRefreshTokenFatalError", () => {
  it("returns true for invalid_grant and refresh_token_not_found", () => {
    expect(isRefreshTokenFatalError({ code: "invalid_grant" })).toBe(true);
    expect(isRefreshTokenFatalError({ code: "refresh_token_not_found" })).toBe(true);
    expect(isRefreshTokenFatalError({ message: "Invalid Refresh Token: Already Used" })).toBe(true);
  });

  it("returns false for unrelated errors", () => {
    expect(isRefreshTokenFatalError({ message: "Network request failed" })).toBe(false);
    expect(isRefreshTokenFatalError(null)).toBe(false);
  });
});

describe("msUntilProactiveRefresh", () => {
  it("clamps to minimum delay when token is almost expired", () => {
    const soon = Math.floor(Date.now() / 1000) + 20;
    expect(msUntilProactiveRefresh(soon)).toBe(5000);
  });

  it("schedules before expiry by buffer", () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const ms = msUntilProactiveRefresh(exp);
    expect(ms).toBeGreaterThan(60_000);
    expect(ms).toBeLessThanOrEqual(600_000 - PROACTIVE_REFRESH_BUFFER_SEC * 1000 + 1000);
  });

  it("returns null when expiresAt missing", () => {
    expect(msUntilProactiveRefresh(null)).toBe(null);
    expect(msUntilProactiveRefresh(undefined)).toBe(null);
  });

  it("uses minimum delay when JWT is already inside the refresh window or expired", () => {
    const past = Math.floor(Date.now() / 1000) - 120;
    expect(msUntilProactiveRefresh(past)).toBe(5000);
  });
});
