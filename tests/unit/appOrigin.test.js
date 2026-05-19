/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

describe("appOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not redirect www sign-in to legacy app.paidly.co.za when VITE_APP_URL is legacy", async () => {
    vi.stubEnv("VITE_APP_URL", "https://app.paidly.co.za");
    Object.defineProperty(window, "location", {
      value: new URL("https://www.paidly.co.za/login"),
      writable: true,
    });
    const { shouldRedirectToAppAfterAuth, getAppDashboardUrl, resolvePaidlyAppOrigin } =
      await import("@/lib/appOrigin");
    expect(shouldRedirectToAppAfterAuth()).toBe(false);
    expect(resolvePaidlyAppOrigin()).toBe("https://www.paidly.co.za");
    expect(getAppDashboardUrl()).toBe("https://www.paidly.co.za/Dashboard");
  });

  it("redirects when sign-in host truly differs from configured app host", async () => {
    vi.stubEnv("VITE_APP_URL", "https://app.example.com");
    Object.defineProperty(window, "location", {
      value: new URL("https://www.example.com/login"),
      writable: true,
    });
    const { shouldRedirectToAppAfterAuth } = await import("@/lib/appOrigin");
    expect(shouldRedirectToAppAfterAuth()).toBe(true);
  });

  it("uses current origin when VITE_APP_URL is unset", async () => {
    vi.stubEnv("VITE_APP_URL", "");
    Object.defineProperty(window, "location", {
      value: new URL("https://www.paidly.co.za/login"),
      writable: true,
    });
    const { resolvePaidlyAppOrigin, shouldRedirectToAppAfterAuth } = await import("@/lib/appOrigin");
    expect(resolvePaidlyAppOrigin()).toBe("https://www.paidly.co.za");
    expect(shouldRedirectToAppAfterAuth()).toBe(false);
  });
});
