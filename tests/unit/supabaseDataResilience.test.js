import { describe, expect, it } from "vitest";
import { isRetryablePostgrestOrTransportError } from "@/lib/supabaseDataResilience";

describe("isRetryablePostgrestOrTransportError", () => {
  it("returns false for RLS and no-rows", () => {
    expect(isRetryablePostgrestOrTransportError({ code: "42501" })).toBe(false);
    expect(isRetryablePostgrestOrTransportError({ code: "PGRST116" })).toBe(false);
  });

  it("returns true for gateway / timeout style failures", () => {
    expect(isRetryablePostgrestOrTransportError({ status: 503 })).toBe(true);
    expect(isRetryablePostgrestOrTransportError({ message: "Failed to fetch" })).toBe(true);
    expect(isRetryablePostgrestOrTransportError({ message: "NetworkError when attempting to fetch" })).toBe(
      true
    );
  });

  it("returns false for 401/403", () => {
    expect(isRetryablePostgrestOrTransportError({ status: 401 })).toBe(false);
    expect(isRetryablePostgrestOrTransportError({ status: 403 })).toBe(false);
  });
});
