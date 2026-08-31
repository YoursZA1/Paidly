import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "../../server/src/securityMiddleware.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function vercelCsp() {
  const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const headers = vercel.headers?.flatMap((h) => h.headers || []) || [];
  const csp = headers.find((h) => h.key === "Content-Security-Policy");
  expect(csp?.value).toBeTruthy();
  return String(csp.value);
}

function formAction(policy) {
  const part = policy
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("form-action "));
  expect(part).toBeTruthy();
  return part;
}

describe("production Content-Security-Policy", () => {
  it("allows PayFast checkout as form-action (not connect-src)", () => {
    const policy = vercelCsp();
    const form = formAction(policy);
    expect(form).toContain("'self'");
    expect(form).toContain("https://www.payfast.co.za");
    expect(form).toContain("https://sandbox.payfast.co.za");
    expect(form).not.toMatch(/form-action\s+\*/);
    expect(policy).not.toMatch(/connect-src[^;]*payfast\.co\.za/);
  });

  it("keeps connect-src restrictive and does not allow ipapi", () => {
    const policy = vercelCsp();
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("https://api.paidly.co.za");
    expect(policy).toContain("https://*.supabase.co");
    expect(policy).toContain("wss://*.supabase.co");
    expect(policy).toContain("https://*.sentry.io");
    expect(policy).not.toMatch(/connect-src\s+\*/);
    expect(policy).not.toContain("ipapi.co");
    expect(policy).not.toContain("unsafe-hashes");
  });

  it("Express CSP matches the PayFast form-action and connect-src hosts", () => {
    const form = formAction(CONTENT_SECURITY_POLICY);
    expect(form).toContain("https://www.payfast.co.za");
    expect(form).toContain("https://sandbox.payfast.co.za");
    expect(CONTENT_SECURITY_POLICY).toContain("https://api.paidly.co.za");
    expect(CONTENT_SECURITY_POLICY).not.toContain("ipapi.co");
  });
});
