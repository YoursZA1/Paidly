import { describe, expect, it } from "vitest";
import { PAST_DUE_GRACE_DAYS } from "../../shared/subscriptionAccess.js";
import {
  PAYMENT_HEALTH,
  customerCancelPatch,
  failedRenewalPatch,
  formatBillingDate,
  graceDaysRemaining,
  nextBillingAfterPayment,
  nextPaymentCountdownDays,
  paymentHealthFor,
  shouldFinishCancelAtPeriodEnd,
  shouldSuspendExpiredGrace,
} from "../../shared/subscriptionBillingPolicy.js";
import { hasSubscriptionAccess } from "../../shared/subscriptionAccess.js";
import { nextBillingFromItn } from "../../server/src/payfastSubscriptionItn.js";
import { isSupersededAgreementItn } from "../../server/src/billing/payfastItnPipeline.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");

describe("failed renewal grace", () => {
  it("starts a 7-day grace and does not cancel", () => {
    const patch = failedRenewalPatch({ status: "active", failure_count: 0 }, NOW, "Insufficient funds");
    expect(patch.status).toBe("past_due");
    expect(patch.graceStarted).toBe(true);
    expect(patch.last_payment_failure_reason).toBe("Insufficient funds");
    expect(patch.next_retry_at).toBeNull();
    const days = (new Date(patch.grace_ends_at).getTime() - NOW.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(PAST_DUE_GRACE_DAYS);
    expect(hasSubscriptionAccess({ status: "past_due", grace_ends_at: patch.grace_ends_at }, NOW)).toBe(true);
  });

  it("leaves a suspended agreement suspended when PayFast reports another failure", () => {
    const patch = failedRenewalPatch(
      { status: "suspended", grace_ends_at: "2026-10-01T00:00:00.000Z", failure_count: 2 },
      NOW
    );
    expect(patch.status).toBe("suspended");
    expect(patch.graceStarted).toBe(false);
    expect(hasSubscriptionAccess({ status: patch.status, grace_ends_at: patch.grace_ends_at }, NOW)).toBe(false);
  });

  it("does not restart grace when PayFast sends another failure", () => {
    const first = failedRenewalPatch({ status: "active" }, NOW);
    const again = failedRenewalPatch(
      { status: "past_due", grace_ends_at: first.grace_ends_at, past_due_at: first.past_due_at, failure_count: 1 },
      new Date("2026-10-10T12:00:00.000Z")
    );
    expect(again.grace_ends_at).toBe(first.grace_ends_at);
    expect(again.graceStarted).toBe(false);
    expect(again.status).toBe("past_due");
  });

  it("suspends only after grace_ends_at", () => {
    const open = {
      status: "past_due",
      past_due_at: "2026-10-08T12:00:00.000Z",
      grace_ends_at: "2026-10-15T12:00:00.000Z",
    };
    const closed = { status: "past_due", grace_ends_at: "2026-10-08T11:00:00.000Z" };
    expect(shouldSuspendExpiredGrace(open, NOW)).toBe(false);
    expect(shouldSuspendExpiredGrace(closed, NOW)).toBe(true);
    expect(hasSubscriptionAccess(closed, NOW)).toBe(false);
    expect(paymentHealthFor(open, new Date("2026-10-09T12:00:00.000Z"))).toBe(PAYMENT_HEALTH.PAST_DUE);
    expect(paymentHealthFor(open, new Date("2026-10-12T12:00:00.000Z"))).toBe(PAYMENT_HEALTH.GRACE_PERIOD);
    expect(paymentHealthFor(closed, NOW)).toBe(PAYMENT_HEALTH.SUSPENDED);
    expect(paymentHealthFor({ status: "active" }, NOW)).toBe(PAYMENT_HEALTH.GOOD);
    expect(graceDaysRemaining(open, NOW)).toBe(7);
  });
});

describe("cancel at period end", () => {
  it("keeps an active agreement until the paid period ends", () => {
    const sub = { status: "active", current_period_end: "2026-11-08T00:00:00.000Z" };
    const decision = customerCancelPatch(sub, NOW);
    expect(decision.cancelAtPeriodEnd).toBe(true);
    expect(decision.patch.status).toBeUndefined();
    expect(shouldFinishCancelAtPeriodEnd({ ...sub, cancel_at_period_end: true }, NOW)).toBe(false);
    expect(
      shouldFinishCancelAtPeriodEnd(
        { status: "active", cancel_at_period_end: true, current_period_end: "2026-10-01T00:00:00.000Z" },
        NOW
      )
    ).toBe(true);
  });

  it("cancels immediately when the paid period is already over", () => {
    const decision = customerCancelPatch(
      { status: "past_due", current_period_end: "2026-10-01T00:00:00.000Z" },
      NOW
    );
    expect(decision.cancelAtPeriodEnd).toBe(false);
    expect(decision.patch.status).toBe("cancelled");
  });
});

describe("billing countdown", () => {
  it("formats the canonical next billing date in Johannesburg time", () => {
    expect(formatBillingDate("2026-11-08T00:00:00.000Z")).toBe("8 November 2026");
    expect(nextPaymentCountdownDays("2026-11-08T12:00:00.000Z", NOW)).toBe(31);
  });
});

describe("failed first payment", () => {
  it.each(["pending", "processing", "trialing", "cancelled", "expired"])(
    "a failure on a %s row never starts a grace period or grants access",
    (status) => {
      const patch = failedRenewalPatch({ status, failure_count: 0 }, NOW, "Card declined");
      expect(patch.initialFailure).toBe(true);
      expect(patch.graceStarted).toBe(false);
      expect(patch.status).not.toBe("past_due");
      expect(patch.grace_ends_at).toBeNull();
      expect(hasSubscriptionAccess({ status: patch.status, grace_ends_at: patch.grace_ends_at }, NOW)).toBe(
        status === "trialing" ? hasSubscriptionAccess({ status }, NOW) : false
      );
    }
  );

  it("a pending checkout that fails becomes failed", () => {
    expect(failedRenewalPatch({ status: "pending" }, NOW).status).toBe("failed");
  });
});

describe("next billing date after a payment", () => {
  it("is always in the future", () => {
    // ITN billing_date is the anchor (often today or the original start date).
    expect(nextBillingAfterPayment("2026-10-08T00:00:00.000Z", 1, NOW)).toBe("2026-11-08T00:00:00.000Z");
    expect(nextBillingAfterPayment("2026-03-08T00:00:00.000Z", 1, NOW)).toBe("2026-11-08T00:00:00.000Z");
    expect(new Date(nextBillingAfterPayment(null, 1, NOW)).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("keeps a future anchor and the billing day; annual cycles roll by a year", () => {
    expect(nextBillingAfterPayment("2026-12-01T00:00:00.000Z", 1, NOW)).toBe("2026-12-01T00:00:00.000Z");
    expect(nextBillingAfterPayment("2025-10-20T00:00:00.000Z", 12, NOW)).toBe("2026-10-20T00:00:00.000Z");
    expect(nextBillingAfterPayment("2026-01-31T00:00:00.000Z", 1, NOW).slice(0, 10)).toBe("2026-10-31");
  });

  it("is what the ITN handler uses for the subscription and the ledger", () => {
    const next = nextBillingFromItn({ billing_date: "2026-10-08", custom_str3: "monthly" }, NOW);
    expect(next).toBe("2026-11-08T00:00:00.000Z");
  });
});

describe("ITN from a replaced PayFast agreement", () => {
  const current = { id: "s1", payfast_token: "new-token" };
  it("is recognised only when found through the user fallback with a different token", () => {
    expect(isSupersededAgreementItn({ ...current, _matchedBy: "user" }, { token: "old-token" })).toBe(true);
    expect(isSupersededAgreementItn({ ...current, _matchedBy: "user" }, { token: "new-token" })).toBe(false);
    expect(isSupersededAgreementItn({ ...current, _matchedBy: "token" }, { token: "new-token" })).toBe(false);
    // A new checkout's first ITN matches by m_payment_id while the row still holds the old token.
    expect(isSupersededAgreementItn({ ...current, _matchedBy: "m_payment_id" }, { token: "brand-new" })).toBe(false);
    expect(isSupersededAgreementItn({ id: "s1", payfast_token: null, _matchedBy: "user" }, { token: "x" })).toBe(false);
  });
});
