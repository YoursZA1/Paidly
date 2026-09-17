import { describe, expect, it } from "vitest";
import {
  derivePortalStatus,
  isExpiredPortalInvite,
  isPendingPortalInvite,
  PORTAL_STATUS,
  portalAccessActionLabel,
  portalStatusLabel,
} from "../../shared/workforce/portalAccess.js";
import {
  isPosPinLocked,
  nextPosPinLockUntil,
  normalizePosPin,
  POS_PIN_MAX_ATTEMPTS,
  publicPosPinState,
} from "../../shared/pos/posPin.js";
import { membershipIsPosEnabled, membershipCanEnterPos, posAccessPath, posTillPath } from "../../shared/posStaffInvite.js";

describe("derivePortalStatus", () => {
  it("returns revoked when portal_revoked_at is set", () => {
    expect(
      derivePortalStatus({ user_id: "u1", portal_revoked_at: "2026-09-01T00:00:00Z" }, null)
    ).toBe(PORTAL_STATUS.REVOKED);
  });

  it("returns activated when user_id is linked", () => {
    expect(derivePortalStatus({ user_id: "u1" }, { status: "pending" })).toBe(PORTAL_STATUS.ACTIVATED);
  });

  it("returns invitation_sent for pending non-expired invites", () => {
    const expires = new Date(Date.now() + 60_000).toISOString();
    expect(derivePortalStatus({}, { status: "pending", expires_at: expires })).toBe(
      PORTAL_STATUS.INVITATION_SENT
    );
  });

  it("returns not_activated when there is no user and no invite", () => {
    expect(derivePortalStatus({}, null)).toBe(PORTAL_STATUS.NOT_ACTIVATED);
    expect(portalStatusLabel(PORTAL_STATUS.NOT_ACTIVATED)).toBe("Not Activated");
    expect(portalStatusLabel("not_invited")).toBe("Not Activated");
  });

  it("returns expired for pending invites past expires_at", () => {
    const expires = new Date(Date.now() - 60_000).toISOString();
    expect(isPendingPortalInvite({ status: "pending", expires_at: expires })).toBe(false);
    expect(isExpiredPortalInvite({ status: "pending", expires_at: expires })).toBe(true);
    expect(derivePortalStatus({}, { status: "pending", expires_at: expires })).toBe(
      PORTAL_STATUS.EXPIRED
    );
    expect(portalStatusLabel(PORTAL_STATUS.EXPIRED)).toBe("Expired");
    expect(portalAccessActionLabel(PORTAL_STATUS.EXPIRED)).toBe("Send New Activation Link");
  });
});

describe("POS PIN helpers", () => {
  it("accepts digit PINs in range", () => {
    expect(normalizePosPin("1234").ok).toBe(true);
    expect(normalizePosPin("12a4").ok).toBe(false);
    expect(normalizePosPin("12").ok).toBe(false);
  });

  it("locks after max attempts", () => {
    const until = nextPosPinLockUntil(POS_PIN_MAX_ATTEMPTS);
    expect(until).toBeTruthy();
    expect(isPosPinLocked({ pos_pin_locked_until: until })).toBe(true);
    expect(publicPosPinState({ pos_pin_hash: "x", pos_pin_locked_until: until }).pos_pin_set).toBe(true);
    expect(publicPosPinState({ pos_pin_hash: "x", pos_pin_locked_until: until }).pos_pin_locked).toBe(true);
  });
});

describe("membershipIsPosEnabled", () => {
  it("is true for POS job function and false for marketing", () => {
    expect(membershipIsPosEnabled({ companyRole: "employee", job_function: "pos" })).toBe(true);
    expect(membershipIsPosEnabled({ companyRole: "employee", job_function: "marketing" })).toBe(false);
  });
});

describe("membershipCanEnterPos", () => {
  it("allows owners and managers without a POS job function", () => {
    expect(membershipCanEnterPos({ isOrgOwner: true, companyRole: "employee", job_function: "marketing" })).toBe(
      true
    );
    expect(membershipCanEnterPos({ companyRole: "manager", job_function: "marketing" })).toBe(true);
  });

  it("denies non-POS employees even though RBAC includes pos_access", () => {
    expect(membershipCanEnterPos({ companyRole: "employee", job_function: "marketing" })).toBe(false);
  });

  it("allows POS-enabled employees", () => {
    expect(membershipCanEnterPos({ companyRole: "employee", job_function: "pos" })).toBe(true);
    expect(
      membershipCanEnterPos({ companyRole: "employee", job_function: "general", pos_register_id: "reg-1" })
    ).toBe(true);
  });
});

describe("POS link is not a portal invite", () => {
  it("builds /pos and till URLs without /Workforce or /invite", () => {
    expect(posAccessPath("https://www.paidly.co.za")).toBe("https://www.paidly.co.za/pos");
    expect(posTillPath("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", "https://www.paidly.co.za")).toContain(
      "/pos/till/"
    );
    expect(posAccessPath("https://www.paidly.co.za")).not.toContain("/Workforce");
    expect(posAccessPath("https://www.paidly.co.za")).not.toContain("/invite");
  });
});
