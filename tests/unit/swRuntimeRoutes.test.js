import { describe, expect, it } from "vitest";
import {
  isPaidlyApiRequest,
  isSentryRequest,
  isSupabaseRequest,
} from "../../shared/pwa/swRuntimeRoutes.js";

describe("service worker runtime routes", () => {
  it("matches same-origin Paidly /api only", () => {
    expect(
      isPaidlyApiRequest({
        sameOrigin: true,
        url: new URL("https://app.paidly.co.za/api/company/employees"),
      })
    ).toBe(true);
    expect(
      isPaidlyApiRequest({
        sameOrigin: false,
        url: new URL("https://vercel.com/api/www/avatar?u=yoursza1&s=64"),
      })
    ).toBe(false);
    expect(
      isPaidlyApiRequest({
        sameOrigin: true,
        url: new URL("https://app.paidly.co.za/Payroll"),
      })
    ).toBe(false);
  });

  it("does not treat hostname-only /api paths as Paidly when origin is unknown", () => {
    expect(
      isPaidlyApiRequest({
        url: new URL("https://vercel.com/api/www/avatar?u=yoursza1&s=64"),
      })
    ).toBe(false);
  });

  it("matches Workbox {url, request} using the service worker origin, not sameOrigin", () => {
    const previousSelf = globalThis.self;
    const previousLocation = globalThis.location;
    const runtime = { location: { origin: "https://app.paidly.co.za" } };
    globalThis.self = runtime;
    globalThis.location = runtime.location;
    try {
      expect(
        isPaidlyApiRequest({
          url: new URL("https://app.paidly.co.za/api/company/employees"),
          request: {},
        })
      ).toBe(true);
      expect(
        isPaidlyApiRequest({
          url: new URL("https://vercel.com/api/www/avatar?u=yoursza1&s=64"),
          request: {},
        })
      ).toBe(false);
    } finally {
      globalThis.self = previousSelf;
      globalThis.location = previousLocation;
    }
  });

  it("serializes as a self-contained Workbox generateSW matcher", () => {
    const source = Function.prototype.toString.call(isPaidlyApiRequest);
    expect(source).toContain("pathname.startsWith");
    expect(source).not.toMatch(/\bisSameOriginApiHost\b/);
    expect(source).not.toMatch(/\bgetRuntimeOrigin\b/);
  });

  it("matches Supabase and Sentry by host, not by path", () => {
    expect(isSupabaseRequest({ url: new URL("https://xyz.supabase.co/rest/v1/payslips") })).toBe(true);
    expect(isSupabaseRequest({ url: new URL("https://evil.example/rest/v1/payslips") })).toBe(false);
    expect(isSentryRequest({ url: new URL("https://o123.ingest.sentry.io/api/x") })).toBe(true);
    expect(isSentryRequest({ url: new URL("https://vercel.com/api/www/avatar") })).toBe(false);
  });
});
