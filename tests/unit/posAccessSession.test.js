import { describe, expect, it } from "vitest";
import {
  buildPosAccessCookie,
  clearPosAccessCookie,
  hashPosAccessToken,
  parseCookieHeader,
  readPosAccessTokenFromRequest,
  membershipFromPosAccessRow,
} from "../../server/src/pos/posAccessSession.js";
import { resolvePosRoute } from "../../server/src/pos/posVercelRoute.js";
import { POS_ACCESS_COOKIE, POS_ACCESS_BEARER_PREFIX } from "../../shared/posStaffInvite.js";
import { posInvitePublicErrorMessage, POS_INVITE_INVALID } from "../../shared/companyInviteMessages.js";
import { greetingForHour, firstNameFromEmployee } from "@/lib/pos/posAccessCopy";

describe("POS access-pass token parsing", () => {
  it("reads Bearer pos. tokens and ignores JWTs", () => {
    expect(
      readPosAccessTokenFromRequest({
        headers: { authorization: `Bearer ${POS_ACCESS_BEARER_PREFIX}abc123` },
      })
    ).toBe("abc123");
    expect(
      readPosAccessTokenFromRequest({
        headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig" },
      })
    ).toBe("");
  });

  it("reads the HttpOnly cookie when no POS bearer is present", () => {
    expect(
      readPosAccessTokenFromRequest({
        headers: { cookie: `${POS_ACCESS_COOKIE}=cookie-token; other=1` },
      })
    ).toBe("cookie-token");
  });

  it("hashes tokens and builds a scoped cookie", () => {
    const hash = hashPosAccessToken("secret");
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("secret");
    const cookie = buildPosAccessCookie("secret", { secure: true, maxAgeSeconds: 60 });
    expect(cookie).toContain(`${POS_ACCESS_COOKIE}=secret`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Secure");
    expect(clearPosAccessCookie({ secure: true })).toContain("Max-Age=0");
    expect(parseCookieHeader("a=1; b=two").b).toBe("two");
  });

  it("builds a POS membership from the session row, not client-supplied permissions", () => {
    const membership = membershipFromPosAccessRow({
      org_id: "org-1",
      user_id: null,
      role: "employee",
      job_function: "pos",
      register_id: "reg-1",
    });
    expect(membership.companyRole).toBe("employee");
    expect(membership.jobFunction).toBe("pos");
    expect(membership.posRegisterId).toBe("reg-1");
    expect(membership.isOrgOwner).toBe(false);
  });
});

describe("POS invite activate routes", () => {
  it("resolves one-segment /api/pos aliases without a new function", () => {
    expect(resolvePosRoute({ url: "/api/pos/invite-activate", query: { path: "invite-activate" } })).toEqual({
      route: "invite-activate",
    });
    expect(resolvePosRoute({ url: "/api/pos/access", query: { path: "access" } })).toEqual({
      route: "access",
    });
    expect(resolvePosRoute({ url: "/api/pos/access-end", query: { path: "access-end" } })).toEqual({
      route: "access-end",
    });
  });
});

describe("POS invite copy", () => {
  it("uses the POS access-pass error for expired or revoked invites", () => {
    expect(posInvitePublicErrorMessage("expired")).toBe(POS_INVITE_INVALID);
    expect(posInvitePublicErrorMessage("revoked")).toBe(POS_INVITE_INVALID);
    expect(posInvitePublicErrorMessage("not_found")).toBe(POS_INVITE_INVALID);
    expect(posInvitePublicErrorMessage("email_mismatch")).toMatch(/different email/i);
  });
});

describe("POS invite copy helpers", () => {
  it("greets the employee by first name", () => {
    expect(greetingForHour(8)).toBe("Good morning");
    expect(greetingForHour(15)).toBe("Good afternoon");
    expect(greetingForHour(20)).toBe("Good evening");
    expect(firstNameFromEmployee("John Smith", "a@b.c")).toBe("John");
    expect(firstNameFromEmployee("", "cashier@store.com")).toBe("cashier");
  });
});
