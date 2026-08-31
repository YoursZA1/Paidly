import { describe, expect, it } from "vitest";
import {
  companyInviteShareUrl,
  isUnsafePublicInviteOrigin,
  normalizePublicOrigin,
  PAIDLY_PRODUCTION_ORIGIN,
  resolvePublicAppOrigin,
} from "../../server/src/companyInviteAppUrl.js";
import { interpretResendSendResult } from "../../server/src/sendInvoice.js";
import { companyInvitePath, isPosStaffInviteRequest } from "@shared/posStaffInvite.js";
import { invitePublicErrorMessage } from "@shared/companyInviteMessages.js";

describe("public invite origin", () => {
  it("skips localhost and Vercel previews in production", () => {
    expect(isUnsafePublicInviteOrigin("http://localhost:5173")).toBe(true);
    expect(isUnsafePublicInviteOrigin("https://paidly-git-main.vercel.app")).toBe(true);
    expect(isUnsafePublicInviteOrigin("https://www.paidly.co.za")).toBe(false);
    expect(normalizePublicOrigin("https://paidly.co.za/app")).toBe("https://paidly.co.za");
  });

  it("uses PUBLIC_APP_URL over localhost CLIENT_ORIGIN in production", () => {
    const origin = resolvePublicAppOrigin({
      nodeEnv: "production",
      env: {
        CLIENT_ORIGIN: "http://localhost:5173,https://paidly-git-foo.vercel.app",
        PUBLIC_APP_URL: "https://paidly.co.za",
      },
    });
    expect(origin).toBe("https://paidly.co.za");
  });

  it("falls back to the Paidly production origin when only unsafe hosts are set", () => {
    const origin = resolvePublicAppOrigin({
      nodeEnv: "production",
      env: {
        CLIENT_ORIGIN: "http://127.0.0.1:5173",
        VITE_APP_URL: "https://preview.vercel.app",
      },
    });
    expect(origin).toBe(PAIDLY_PRODUCTION_ORIGIN);
  });

  it("allows localhost in development", () => {
    const origin = resolvePublicAppOrigin({
      nodeEnv: "development",
      env: { CLIENT_ORIGIN: "http://localhost:5173" },
    });
    expect(origin).toBe("http://localhost:5173");
  });

  it("builds /invite/:token and /pos/invite/:token share URLs", () => {
    const token = "a".repeat(64);
    expect(
      companyInviteShareUrl(token, { origin: "https://paidly.co.za", source: "company_admin" })
    ).toBe(`https://paidly.co.za/invite/${token}`);
    expect(companyInvitePath(token, "https://paidly.co.za")).toBe(`https://paidly.co.za/invite/${token}`);
    expect(
      companyInviteShareUrl("7K4M-X92Q", { origin: "https://paidly.co.za", source: "pos" })
    ).toBe("https://paidly.co.za/pos/invite/7K4M-X92Q");
  });
});

describe("POS invite intent", () => {
  it("treats Employee + POS only as a till invite without promoting permissions", () => {
    expect(isPosStaffInviteRequest({ role: "employee", jobFunction: "pos" })).toBe(true);
    expect(isPosStaffInviteRequest({ source: "pos", role: "manager" })).toBe(true);
    expect(isPosStaffInviteRequest({ role: "manager", jobFunction: "pos" })).toBe(false);
    expect(isPosStaffInviteRequest({ role: "admin", jobFunction: "pos" })).toBe(false);
    expect(isPosStaffInviteRequest({ role: "employee", jobFunction: "sales" })).toBe(false);
  });
});

describe("invite public errors", () => {
  it("maps acceptance failures to user-facing copy", () => {
    expect(invitePublicErrorMessage("email_mismatch")).toMatch(/different email/i);
    expect(invitePublicErrorMessage("revoked")).toMatch(/revoked/i);
    expect(invitePublicErrorMessage("expired")).toMatch(/expired/i);
    expect(invitePublicErrorMessage("not_pending", "accepted")).toMatch(/already been accepted/i);
  });
});

describe("Resend send result", () => {
  it("does not mark success when the SDK returns error without throwing", () => {
    expect(interpretResendSendResult({ data: null, error: { message: "Invalid API key" } })).toEqual({
      success: false,
      error: "Invalid API key",
    });
    expect(interpretResendSendResult({ data: { id: "abc" }, error: null }).success).toBe(true);
  });
});
