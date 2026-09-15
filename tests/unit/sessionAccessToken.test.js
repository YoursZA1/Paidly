import { describe, expect, it } from "vitest";
import { getSessionAccessToken, hasSessionAccessToken } from "../../src/lib/authUserId.js";
import { isPostgrestForbiddenError } from "../../src/utils/supabaseErrorUtils.js";

describe("session access token", () => {
  it("accepts AuthContext and GoTrue session shapes", () => {
    expect(hasSessionAccessToken({ accessToken: "eyJ" })).toBe(true);
    expect(hasSessionAccessToken({ access_token: "eyJ" })).toBe(true);
    expect(hasSessionAccessToken({ accessToken: "  " })).toBe(false);
    expect(hasSessionAccessToken(null)).toBe(false);
    expect(getSessionAccessToken({ access_token: " eyJ " })).toBe("eyJ");
    expect(getSessionAccessToken({ accessToken: "abc" })).toBe("abc");
    expect(getSessionAccessToken(null)).toBe(null);
  });
});

describe("isPostgrestForbiddenError", () => {
  it("matches 403 grant failures and skips empty RLS results", () => {
    expect(isPostgrestForbiddenError({ status: 403, message: "permission denied for function" })).toBe(
      true
    );
    expect(isPostgrestForbiddenError({ code: "42501" })).toBe(true);
    expect(isPostgrestForbiddenError({ status: 200, message: "ok" })).toBe(false);
  });
});
