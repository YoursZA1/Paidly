import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("server loginIpRateLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("allows up to LOGIN_RATE_PER_IP_MAX attempts then returns retryAfterSeconds", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LOGIN_RATE_LIMIT_IN_DEV", "true");
    vi.stubEnv("LOGIN_RATE_PER_IP_MAX", "3");
    vi.stubEnv("LOGIN_RATE_PER_IP_WINDOW_MS", "3600000");

    const { consumeLoginSlot } = await import("../../server/src/loginIpRateLimit.js");
    const ip = "203.0.113.50";

    expect(consumeLoginSlot(ip)).toEqual({ ok: true });
    expect(consumeLoginSlot(ip)).toEqual({ ok: true });
    expect(consumeLoginSlot(ip)).toEqual({ ok: true });
    const blocked = consumeLoginSlot(ip);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("skips limiting when LOGIN_RATE_LIMIT_ENABLED is false", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LOGIN_RATE_LIMIT_ENABLED", "false");
    vi.stubEnv("LOGIN_RATE_PER_IP_MAX", "1");

    const { consumeLoginSlot } = await import("../../server/src/loginIpRateLimit.js");
    const ip = "203.0.113.51";
    expect(consumeLoginSlot(ip)).toEqual({ ok: true });
    expect(consumeLoginSlot(ip)).toEqual({ ok: true });
  });
});
