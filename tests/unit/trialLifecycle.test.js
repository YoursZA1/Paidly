import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasSubscriptionAccess } from "../../shared/subscriptionAccess.js";
import { buildAdminOverridePatch } from "../../server/src/billing/adminSubscriptionOverride.js";
import {
  TRIAL_NOTIFY,
  TRIAL_PHASE,
  adminTrialNotificationType,
  buildTrialEmail,
  companySkipsTrialNotifications,
  deriveTrialPhase,
  notificationAlreadySent,
  planTrialNotifications,
  trialNotificationCandidates,
} from "../../shared/trialLifecycle.js";

const NOW = new Date("2026-10-08T10:00:00.000Z");

function trialRow(overrides = {}) {
  return {
    id: "sub-1",
    company_id: "co-1",
    user_id: "user-1",
    status: "trialing",
    trial_ends_at: "2026-10-11T10:00:00.000Z",
    subscription_source: "system_trial",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveTrialPhase", () => {
  it("is active while more than 3 days remain", () => {
    const phase = deriveTrialPhase(trialRow({ trial_ends_at: "2026-10-14T10:00:00.000Z" }), NOW);
    expect(phase.phase).toBe(TRIAL_PHASE.TRIAL_ACTIVE);
    expect(phase.daysRemaining).toBe(6);
  });

  it("is ending soon from 3 days through the last day", () => {
    expect(deriveTrialPhase(trialRow(), NOW).phase).toBe(TRIAL_PHASE.TRIAL_ENDING_SOON);
    expect(deriveTrialPhase(trialRow(), NOW).daysRemaining).toBe(3);
    const lastDay = deriveTrialPhase(trialRow({ trial_ends_at: "2026-10-08T18:00:00.000Z" }), NOW);
    expect(lastDay.phase).toBe(TRIAL_PHASE.TRIAL_ENDING_SOON);
    expect(lastDay.daysRemaining).toBe(1);
  });

  it("is expired once trial_ends_at has passed and access is gone", () => {
    const phase = deriveTrialPhase(
      trialRow({ status: "expired", trial_ends_at: "2026-10-06T10:00:00.000Z" }),
      NOW
    );
    expect(phase.phase).toBe(TRIAL_PHASE.TRIAL_EXPIRED);
    expect(phase.daysSinceExpiry).toBe(2);
    expect(hasSubscriptionAccess(trialRow({ status: "expired", trial_ends_at: "2026-10-06T10:00:00.000Z" }), NOW)).toBe(
      false
    );
  });

  it("treats a paid subscription as subscribed, not an expired trial", () => {
    const phase = deriveTrialPhase(
      trialRow({
        status: "active",
        subscription_source: "payfast",
        trial_ends_at: "2026-10-01T00:00:00.000Z",
      }),
      NOW
    );
    expect(phase.phase).toBe(TRIAL_PHASE.SUBSCRIPTION_ACTIVE);
  });

  it("shows free access for an admin grant and for a timed flag", () => {
    expect(
      deriveTrialPhase(
        trialRow({ status: "active", subscription_source: "admin", trial_ends_at: null }),
        NOW
      ).phase
    ).toBe(TRIAL_PHASE.FREE_ACCESS);
    expect(
      deriveTrialPhase(
        trialRow({
          status: "expired",
          free_access: true,
          free_access_until: "2026-11-01T00:00:00.000Z",
        }),
        NOW
      ).phase
    ).toBe(TRIAL_PHASE.FREE_ACCESS);
  });

  it("shows suspended even when a free-access flag is still set", () => {
    expect(
      deriveTrialPhase(trialRow({ status: "suspended", free_access: true }), NOW).phase
    ).toBe(TRIAL_PHASE.SUSPENDED);
  });
});

describe("trial notification plan", () => {
  it("queues the 3-day warning once, and a failed send does not count", () => {
    const row = trialRow();
    expect(trialNotificationCandidates(row, NOW)).toEqual([TRIAL_NOTIFY.ENDING]);
    const planned = planTrialNotifications([[row]], [], NOW);
    expect(planned).toHaveLength(1);
    expect(planned[0].type).toBe(TRIAL_NOTIFY.ENDING);

    const sent = [{ subscription_id: row.id, notification_type: TRIAL_NOTIFY.ENDING, status: "sent", trial_ends_at: row.trial_ends_at }];
    expect(notificationAlreadySent(sent, row, TRIAL_NOTIFY.ENDING)).toBe(true);
    expect(planTrialNotifications([[row]], sent, NOW)).toHaveLength(0);

    const failed = [{ ...sent[0], status: "failed" }];
    expect(planTrialNotifications([[row]], failed, NOW)).toHaveLength(1);
  });

  it("sends expiry before the follow-up, and only once per trial end", () => {
    const row = trialRow({ status: "expired", trial_ends_at: "2026-10-04T10:00:00.000Z" });
    expect(trialNotificationCandidates(row, NOW)).toEqual([TRIAL_NOTIFY.EXPIRED, TRIAL_NOTIFY.FOLLOWUP]);
    expect(planTrialNotifications([[row]], [], NOW)[0].type).toBe(TRIAL_NOTIFY.EXPIRED);
    const afterExpiry = [
      { subscription_id: row.id, notification_type: TRIAL_NOTIFY.EXPIRED, status: "sent", trial_ends_at: row.trial_ends_at },
    ];
    expect(planTrialNotifications([[row]], afterExpiry, NOW)[0].type).toBe(TRIAL_NOTIFY.FOLLOWUP);
  });

  it("does not mail a company that subscribed, has free access, or was suspended", () => {
    const expired = trialRow({ status: "expired", trial_ends_at: "2026-10-01T00:00:00.000Z" });
    const paid = trialRow({
      id: "sub-paid",
      status: "active",
      subscription_source: "payfast",
      updated_at: "2026-10-07T00:00:00.000Z",
    });
    expect(companySkipsTrialNotifications([expired, paid], NOW)).toBe(true);
    expect(planTrialNotifications([[expired, paid]], [], NOW)).toHaveLength(0);

    const free = { ...expired, free_access: true, free_access_until: "2026-12-01T00:00:00.000Z" };
    expect(planTrialNotifications([[free]], [], NOW)).toHaveLength(0);

    const suspended = { ...expired, id: "sub-s", status: "suspended", updated_at: "2026-10-08T00:00:00.000Z" };
    expect(planTrialNotifications([[expired, suspended]], [], NOW)).toHaveLength(0);
  });

  it("does not apply one company's subscription to another company", () => {
    const ended = trialRow({ company_id: "co-a", status: "expired", trial_ends_at: "2026-10-07T10:00:00.000Z" });
    const other = trialRow({
      id: "sub-b",
      company_id: "co-b",
      status: "active",
      subscription_source: "payfast",
      trial_ends_at: "2026-09-01T00:00:00.000Z",
    });
    const planned = planTrialNotifications([[ended], [other]], [], NOW);
    expect(planned.map((item) => item.subscription.company_id)).toEqual(["co-a"]);
  });

  it("starts a new cycle after the trial end date changes", () => {
    const row = trialRow();
    const oldSend = [
      {
        subscription_id: row.id,
        notification_type: TRIAL_NOTIFY.ENDING,
        status: "sent",
        trial_ends_at: "2026-10-08T10:00:00.000Z",
      },
    ];
    expect(notificationAlreadySent(oldSend, row, TRIAL_NOTIFY.ENDING)).toBe(false);
  });

  it("uses the conversion subjects", () => {
    expect(buildTrialEmail(TRIAL_NOTIFY.ENDING, { name: "Amahle" }).subject).toBe(
      "Your Paidly trial is ending soon"
    );
    expect(buildTrialEmail(TRIAL_NOTIFY.ENDING, { name: "Amahle" }).paragraphs[0]).toBe("Hi Amahle,");
    expect(buildTrialEmail(TRIAL_NOTIFY.EXPIRED).subject).toBe("Your Paidly trial has ended");
    expect(buildTrialEmail(TRIAL_NOTIFY.FOLLOWUP).subject).toBe("Ready to get back to business?");
    expect(buildTrialEmail(TRIAL_NOTIFY.FOLLOWUP).ctaLabel).toBe("Reactivate Paidly");
  });
});

describe("trial conversion migration", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261008193000_trial_conversion_notifications.sql", import.meta.url),
    "utf8"
  );

  it("records sends on the subscription row and does not add a second status", () => {
    expect(sql).toMatch(/subscription_notifications/);
    expect(sql).toMatch(/subscription_notifications_sent_once/);
    expect(sql).toMatch(/free_access/);
    expect(sql).not.toMatch(/ADD CONSTRAINT.*status/i);
    expect(sql).toMatch(/WHEN lower\(trim\(coalesce\(s\.status, ''\)\)\) = 'suspended' THEN false/);
  });
});

describe("admin manual sends", () => {
  it("do not use up the automatic email for the same trial", () => {
    const sub = trialRow({ trial_ends_at: "2026-10-05T10:00:00.000Z", status: "expired" });
    const history = [
      {
        subscription_id: sub.id,
        notification_type: TRIAL_NOTIFY.EXPIRED,
        status: "sent",
        source: "admin",
        trial_ends_at: sub.trial_ends_at,
      },
    ];
    expect(notificationAlreadySent(history, sub, TRIAL_NOTIFY.EXPIRED)).toBe(false);
    expect(notificationAlreadySent([{ ...history[0], source: "system" }], sub, TRIAL_NOTIFY.EXPIRED)).toBe(true);
  });

  it("pick the copy from the trial phase", () => {
    const open = trialRow();
    const lapsed = trialRow({ status: "expired", trial_ends_at: "2026-10-05T10:00:00.000Z" });
    expect(adminTrialNotificationType([open], open, "send_trial_reminder", NOW)).toEqual({ type: TRIAL_NOTIFY.ENDING });
    expect(adminTrialNotificationType([lapsed], lapsed, "send_trial_reminder", NOW)).toEqual({ type: TRIAL_NOTIFY.EXPIRED });
    expect(adminTrialNotificationType([lapsed], lapsed, "send_subscription_prompt", NOW)).toEqual({
      type: TRIAL_NOTIFY.REACTIVATION,
    });
    expect(buildTrialEmail(TRIAL_NOTIFY.REACTIVATION).ctaLabel).toBe("Reactivate Paidly");
  });

  it("refuse a subscribed, free-access, or suspended company", () => {
    const lapsed = trialRow({ status: "expired", trial_ends_at: "2026-10-05T10:00:00.000Z" });
    const paid = { id: "sub-2", company_id: "co-1", status: "active", subscription_source: "payfast" };
    expect(adminTrialNotificationType([lapsed, paid], lapsed, "send_trial_reminder", NOW).error).toMatch(/subscribed/);
    const free = { ...lapsed, free_access: true, free_access_until: null };
    expect(adminTrialNotificationType([free], free, "send_subscription_prompt", NOW).error).toMatch(/free access/);
    const suspended = { ...lapsed, status: "suspended" };
    expect(adminTrialNotificationType([suspended], suspended, "send_trial_reminder", NOW).error).toMatch(/suspended/);
  });
});

describe("admin trial extension", () => {
  it("keeps the start date and records previous and new expiry", () => {
    const existing = trialRow({ trial_started_at: "2026-09-24T10:00:00.000Z", trial_ends_at: "2026-10-08T10:00:00.000Z", status: "expired" });
    const { patch, description } = buildAdminOverridePatch(existing, { action: "extend_trial", days: 7 }, { now: NOW });
    expect(patch.status).toBe("trialing");
    expect(patch.trial_started_at).toBeUndefined();
    expect(patch.trial_ends_at).toBe("2026-10-15T10:00:00.000Z");
    expect(description).toMatch(/by 7 days/);
    expect(description).toMatch(/Previous expiry: 8 October 2026/);
    expect(description).toMatch(/New expiry: 15 October 2026/);
  });

  it("refuses to turn a paying PayFast subscription back into a trial", () => {
    const paid = { id: "sub-2", status: "active", subscription_source: "payfast", payfast_token: "tok" };
    expect(() => buildAdminOverridePatch(paid, { action: "extend_trial", days: 7 }, { now: NOW })).toThrow(
      /already pays/
    );
  });
});

describe("system-only notification index", () => {
  const sql = readFileSync(
    new URL("../../supabase/migrations/20261008210000_trial_notifications_system_once.sql", import.meta.url),
    "utf8"
  );

  it("limits the once-only rule to automatic sends", () => {
    expect(sql).toMatch(/DROP INDEX IF EXISTS public\.subscription_notifications_sent_once/);
    expect(sql).toMatch(/WHERE status = 'sent' AND source = 'system'/);
  });
});
