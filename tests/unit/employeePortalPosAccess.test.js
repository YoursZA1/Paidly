import { describe, expect, it } from "vitest";
import {
  derivePortalStatus,
  isPendingPortalInvite,
  PORTAL_STATUS,
  portalStatusLabel,
} from "../../shared/workforce/portalAccess.js";
import {
  isPosPinLocked,
  nextPosPinLockUntil,
  normalizePosPin,
  POS_PIN_MAX_ATTEMPTS,
  publicPosPinState,
} from "../../shared/pos/posPin.js";
import { membershipIsPosEnabled } from "../../shared/posStaffInvite.js";

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

  it("returns not_invited when there is no user and no pending invite", () => {
    expect(derivePortalStatus({}, null)).toBe(PORTAL_STATUS.NOT_INVITED);
    expect(portalStatusLabel(PORTAL_STATUS.NOT_INVITED)).toBe("Not invited");
  });

  it("treats expired invites as not pending", () => {
    const expires = new Date(Date.now() - 60_000).toISOString();
    expect(isPendingPortalInvite({ status: "pending", expires_at: expires })).toBe(false);
    expect(derivePortalStatus({}, { status: "pending", expires_at: expires })).toBe(
      PORTAL_STATUS.NOT_INVITED
    );
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
