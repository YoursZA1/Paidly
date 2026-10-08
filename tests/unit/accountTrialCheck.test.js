import { describe, expect, it } from "vitest";
import { decideAccountTrial } from "../../shared/accountTrialCheck.js";
import { TRIAL_DURATION_DAYS } from "../../shared/subscriptionAccess.js";
import { buildTrialEmail, TRIAL_NOTIFY, trialNotificationCandidates } from "../../shared/trialLifecycle.js";

const NOW = new Date("2026-10-08T12:00:00.000Z");

function row(overrides = {}) {
  return {
    id: "sub-1",
    status: "trialing",
    subscription_source: "system_trial",
    accountCreatedAt: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("decideAccountTrial", () => {
  it("uses the configured trial length from the account creation time", () => {
    expect(TRIAL_DURATION_DAYS).toBe(7);
    const open = decideAccountTrial(row({ accountCreatedAt: "2026-10-03T12:00:00.000Z" }), NOW);
    expect(open.action).toBe("anchor");
    expect(open.phase).toBe("TRIAL_ACTIVE");
    expect(open.trialEndsAt).toBe("2026-10-10T12:00:00.000Z");

    const due = decideAccountTrial(row(), NOW);
    expect(due.action).toBe("expire");
    expect(due.phase).toBe("TRIAL_EXPIRED");
    expect(due.trialEndsAt).toBe("2026-10-08T12:00:00.000Z");
  });

  it("expires an existing account whose creation date plus the trial length is past", () => {
    const decision = decideAccountTrial(
      row({
        accountCreatedAt: "2026-09-01T08:00:00.000Z",
        trial_ends_at: "2026-10-15T00:00:00.000Z",
      }),
      NOW
    );
    expect(decision.action).toBe("expire");
    expect(decision.phase).toBe("TRIAL_EXPIRED");
    expect(decision.trialEndsAt).toBe("2026-09-08T08:00:00.000Z");
  });

  it("does not mark a subscribed, free-access, or admin-managed account expired", () => {
    expect(decideAccountTrial(row({ status: "active" }), NOW).reason).toBe("active");
    expect(
      decideAccountTrial(row({ free_access: true, free_access_until: null }), NOW).reason
    ).toBe("free_access");
    expect(
      decideAccountTrial(
        row({
          subscription_source: "admin",
          admin_override: true,
          trial_ends_at: "2026-11-01T00:00:00.000Z",
          accountCreatedAt: "2026-01-01T00:00:00.000Z",
        }),
        NOW
      ).reason
    ).toBe("admin");
  });

  it("does not move an expiry date that is already in the past", () => {
    const decision = decideAccountTrial(
      row({
        status: "expired",
        accountCreatedAt: "2026-01-01T00:00:00.000Z",
        trial_ends_at: "2026-09-20T00:00:00.000Z",
      }),
      NOW
    );
    expect(decision.action).toBe("unchanged");
    expect(decision.trialEndsAt).toBe("2026-09-20T00:00:00.000Z");
  });
});

describe("trial ended email", () => {
  it("uses the subscription message and still sends it once for an old expiry", () => {
    const mail = buildTrialEmail(TRIAL_NOTIFY.EXPIRED, { name: "Amahle Dlamini" });
    expect(mail.subject).toBe("Your Paidly trial has ended");
    expect(mail.paragraphs).toEqual([
      "Hi Amahle,",
      "Your Paidly trial has ended.",
      "Your account and business information are still available.",
      "Subscribe to Paidly to continue managing your business with invoicing, quotes, expenses, POS and more.",
    ]);
    expect(mail.ctaLabel).toBe("Subscribe to Paidly");
    expect(mail.note).toBe("The Paidly Team");

    const old = {
      id: "sub-old",
      status: "expired",
      trial_ends_at: "2026-08-01T00:00:00.000Z",
      subscription_source: "system_trial",
    };
    expect(trialNotificationCandidates(old, NOW)).toEqual([TRIAL_NOTIFY.EXPIRED]);
  });
});
