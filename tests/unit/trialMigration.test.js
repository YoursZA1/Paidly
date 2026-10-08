import { describe, expect, it } from "vitest";
import { TRIAL_DURATION_DAYS, hasSubscriptionAccess } from "../../shared/subscriptionAccess.js";
import {
  MIGRATION_STATUS,
  buildMigrationGroups,
  classifyMigrationGroup,
  migrationFingerprint,
  summarizeMigration,
} from "../../shared/trialMigration.js";
import {
  TRIAL_NOTIFY,
  TRIAL_PHASE,
  buildTrialEmail,
  deriveTrialPhase,
  planTrialNotifications,
  trialNotificationCandidates,
} from "../../shared/trialLifecycle.js";
import { buildMigrationAdminPatch } from "../../server/src/billing/trialMigration.js";
import { describeDashboardSubscriptionBanner } from "../../shared/subscriptionDashboardCopy.js";

const NOW = new Date("2026-10-08T10:00:00.000Z");
const DAY = 86_400_000;
const at = (days) => new Date(NOW.getTime() + days * DAY).toISOString();

function group(rows, extra = {}) {
  return { key: "company:co-1", companyId: "co-1", userId: "u-1", rows, ...extra };
}
function sub(overrides = {}) {
  return { id: "sub-1", company_id: "co-1", user_id: "u-1", status: "expired", trial_ends_at: at(-40), ...overrides };
}
const classify = (rows, extra) => classifyMigrationGroup(group(rows, extra), { now: NOW });

describe("classifying existing accounts", () => {
  it("places each clear state", () => {
    expect(classify([sub({ status: "trialing", trial_ends_at: at(10) })]).proposed).toBe(MIGRATION_STATUS.MIGRATED_ACTIVE);
    expect(classify([sub({ status: "trialing", trial_ends_at: at(2) })]).proposed).toBe(MIGRATION_STATUS.MIGRATED_ENDING_SOON);
    expect(classify([sub({ status: "active", subscription_source: "payfast", payfast_token: "t" })]).proposed).toBe(
      MIGRATION_STATUS.MIGRATED_SUBSCRIBED
    );
    expect(classify([sub({ free_access: true, free_access_until: null })]).proposed).toBe(MIGRATION_STATUS.MIGRATED_FREE_ACCESS);
    expect(classify([sub({ status: "suspended" })]).proposed).toBe(MIGRATION_STATUS.MIGRATED_SUSPENDED);
  });

  it("marks an expired trial expired with one email and no grace, without touching its dates", () => {
    const row = sub();
    const out = classify([row], { ownerEmail: "o@x.co" });
    expect(out.proposed).toBe(MIGRATION_STATUS.MIGRATED_EXPIRED);
    expect(out.notificationRequired).toBe(true);
    expect(out.graceDays).toBeNull();
    expect(out.graceEndsAt).toBeNull();
    expect(row.trial_ends_at).toBe(at(-40));
    // A grace length is still available when an admin sets one.
    expect(classifyMigrationGroup(group([row], { ownerEmail: "o@x.co" }), { now: NOW, graceDays: 7 }).graceEndsAt).toBe(at(7));
  });

  it("never guesses: unclear accounts need review", () => {
    expect(classify([], { userId: null }).reasons).toEqual(["No subscription record and no owner account"]);
    expect(classify([sub({ status: "legacy_paid" })]).proposed).toBe(MIGRATION_STATUS.REQUIRES_REVIEW);
    expect(classify([sub({ trial_ends_at: "not a date" })]).proposed).toBe(MIGRATION_STATUS.REQUIRES_REVIEW);
    expect(classify([sub({ status: "trialing", trial_ends_at: null })]).reasons).toContain("Trial with no end date");
    expect(classify([sub({ free_access_until: at(5) })]).reasons).toContain("Free-access end date without free access");
    expect(classify([sub({ status: "cancelled", payfast_token: "t", trial_ends_at: null })]).reasons).toContain(
      "Paid subscription has lapsed (not a trial)"
    );
    expect(classify([sub()], { owner: { subscription_status: "active" } }).proposed).toBe(MIGRATION_STATUS.REQUIRES_REVIEW);
  });

  it("does not treat an unpaid 'active' row as a subscription", () => {
    const legacy = sub({ status: "active", trial_ends_at: null, subscription_source: null, next_billing_date: at(-100) });
    expect(classify([legacy]).reasons).toContain("Active with no payment on record");
    expect(classify([legacy], { hasPayment: true }).proposed).toBe(MIGRATION_STATUS.MIGRATED_SUBSCRIBED);
    expect(classify([{ ...legacy, subscription_source: "admin" }]).proposed).toBe(MIGRATION_STATUS.MIGRATED_FREE_ACCESS);
  });

  it("is idempotent: a decided account is never re-decided", () => {
    const decided = sub({
      trial_migration_status: "MIGRATED_EXPIRED",
      trial_migration_at: at(-2),
      migration_grace_started_at: at(-2),
      migration_grace_ends_at: at(5),
    });
    const out = classify([decided]);
    expect(out.alreadyMigrated).toBe(true);
    expect(out.notificationRequired).toBe(false);
    expect(migrationFingerprint([out])).toBe("");
    // A REQUIRES_REVIEW decision is looked at again, so a fixed account can move on.
    expect(classify([sub({ trial_migration_status: "REQUIRES_REVIEW" })]).alreadyMigrated).toBe(false);
  });

  it("skips excluded and demo accounts", () => {
    expect(classify([sub({ migration_excluded: true })]).skipped).toBe("excluded");
    expect(classify([sub()], { isDemo: true }).skipped).toBe("demo");
  });

  it("groups a company with its owner's company-less rows and keeps companies apart", () => {
    const groups = buildMigrationGroups({
      organizations: [
        { id: "co-a", owner_id: "u-a", name: "A" },
        { id: "co-b", owner_id: "u-b", name: "B" },
      ],
      subscriptions: [
        { id: "s1", company_id: "co-a", status: "expired", trial_ends_at: at(-40) },
        { id: "s2", company_id: null, user_id: "u-a", status: "active", subscription_source: "payfast", payfast_token: "t" },
        { id: "s3", company_id: "co-b", status: "expired", trial_ends_at: at(-40) },
      ],
      profiles: [],
    });
    const results = groups.map((g) => classifyMigrationGroup(g, { now: NOW }));
    expect(results.find((r) => r.companyId === "co-a").proposed).toBe(MIGRATION_STATUS.MIGRATED_SUBSCRIBED);
    expect(results.find((r) => r.companyId === "co-b").proposed).toBe(MIGRATION_STATUS.MIGRATED_EXPIRED);
    const summary = summarizeMigration(results);
    expect(summary.total).toBe(2);
    expect(summary.notifications).toBe(0); // no owner email in this fixture
  });
});

describe("companies with no subscription row: trial from sign-up date", () => {
  const owner = (createdDaysAgo, extra = {}) => ({
    userId: "u-1",
    ownerEmail: "o@x.co",
    owner: { id: "u-1", plan: "individual" },
    ownerAuth: { id: "u-1", created_at: at(-createdDaysAgo), invited_at: null, email_confirmed_at: at(-createdDaysAgo), ...extra },
  });

  it("expires a sign-up older than the trial length and creates the row signup would have", () => {
    const out = classify([], owner(37));
    expect(out.proposed).toBe(MIGRATION_STATUS.MIGRATED_EXPIRED);
    expect(out.derivedFrom).toBe("signup_date");
    expect(out.trialEndsAt).toBe(at(-30));
    expect(out.willCreate).toBe(true);
    expect(out.createRow).toMatchObject({ status: "expired", plan_family: "starter", trial_ends_at: at(-30) });
    expect(out.notificationRequired).toBe(true);
  });

  it("keeps a recent sign-up in trial", () => {
    expect(classify([], owner(2)).proposed).toBe(MIGRATION_STATUS.MIGRATED_ACTIVE);
    expect(classify([], owner(5)).proposed).toBe(MIGRATION_STATUS.MIGRATED_ENDING_SOON);
    expect(classify([], owner(5)).createRow.status).toBe("trialing");
  });

  it("expires but does not email an address that was never confirmed", () => {
    const out = classify([], owner(37, { email_confirmed_at: null }));
    expect(out.proposed).toBe(MIGRATION_STATUS.MIGRATED_EXPIRED);
    expect(out.notificationRequired).toBe(false);
    expect(out.notificationNote).toBe("Email never confirmed");
  });

  it("sends invited users and owners of a second company to review", () => {
    expect(classify([], owner(37, { invited_at: at(-37) })).proposed).toBe(MIGRATION_STATUS.REQUIRES_REVIEW);
    expect(classify([], { ...owner(37), ownerInOtherCompany: true }).proposed).toBe(MIGRATION_STATUS.REQUIRES_REVIEW);
  });

  it("uses the configured trial length from shared/subscriptionAccess.js", () => {
    const out = classify([], owner(TRIAL_DURATION_DAYS));
    expect(out.proposed).toBe(MIGRATION_STATUS.MIGRATED_EXPIRED);
  });
});

describe("grace period and exclusion in the access check", () => {
  it("grants access while grace runs; the account still reads as an expired trial", () => {
    const row = sub({ migration_grace_ends_at: at(3) });
    expect(hasSubscriptionAccess(row, NOW)).toBe(true);
    expect(hasSubscriptionAccess({ ...row, migration_grace_ends_at: at(-1) }, NOW)).toBe(false);
    expect(deriveTrialPhase(row, NOW).phase).toBe(TRIAL_PHASE.TRIAL_EXPIRED);
    expect(hasSubscriptionAccess({ ...row, status: "suspended" }, NOW)).toBe(false);
    expect(hasSubscriptionAccess(sub({ migration_excluded: true }), NOW)).toBe(true);
  });

  it("shows the grace banner with the plans button", () => {
    const copy = describeDashboardSubscriptionBanner(
      { status: "expired", migrationGraceEndsAt: at(5), trialMigrationStatus: "MIGRATED_EXPIRED" },
      NOW
    );
    expect(copy.heading).toBe("Your Paidly trial has ended");
    expect(copy.ctaLabel).toBe("View Paidly Plans");
  });
});

describe("migration emails", () => {
  const migrated = (overrides = {}) =>
    sub({
      trial_migration_status: "MIGRATED_EXPIRED",
      trial_migration_at: at(-1),
      ...overrides,
    });
  const sent = (row, type, daysAgo) => ({
    subscription_id: row.id,
    notification_type: type,
    status: "sent",
    source: "system",
    trial_ends_at: row.trial_migration_at,
    sent_at: at(-daysAgo),
  });

  it("sends the existing-user email, not the standard one, and the follow-up 3 days later", () => {
    const row = migrated();
    expect(trialNotificationCandidates(row, NOW)).toEqual([TRIAL_NOTIFY.EXISTING_EXPIRED, TRIAL_NOTIFY.EXISTING_FOLLOWUP]);
    expect(planTrialNotifications([[row]], [], NOW)[0].type).toBe(TRIAL_NOTIFY.EXISTING_EXPIRED);
    expect(planTrialNotifications([[row]], [sent(row, TRIAL_NOTIFY.EXISTING_EXPIRED, 1)], NOW)).toHaveLength(0);
    const later = [sent(row, TRIAL_NOTIFY.EXISTING_EXPIRED, 3)];
    expect(planTrialNotifications([[row]], later, NOW)[0].type).toBe(TRIAL_NOTIFY.EXISTING_FOLLOWUP);
    const both = [...later, sent(row, TRIAL_NOTIFY.EXISTING_FOLLOWUP, 0)];
    expect(planTrialNotifications([[row]], both, NOW)).toHaveLength(0);
  });

  it("stops when the company subscribes, gets free access, is suspended, or is excluded", () => {
    const row = migrated();
    const paid = { id: "p", company_id: "co-1", status: "active", subscription_source: "payfast", payfast_token: "t" };
    expect(planTrialNotifications([[row, paid]], [], NOW)).toHaveLength(0);
    expect(planTrialNotifications([[migrated({ free_access: true })]], [], NOW)).toHaveLength(0);
    expect(planTrialNotifications([[migrated({ status: "suspended" })]], [], NOW)).toHaveLength(0);
    expect(planTrialNotifications([[migrated({ migration_excluded: true })]], [], NOW)).toHaveLength(0);
  });

  it("sends the ended email once for a trial that ended long ago, without the follow-up", () => {
    const old = sub({ trial_ends_at: at(-40) });
    expect(trialNotificationCandidates(old, NOW)).toEqual([TRIAL_NOTIFY.EXPIRED]);
    const recent = sub({ trial_ends_at: at(-1) });
    expect(trialNotificationCandidates(recent, NOW)).toEqual([TRIAL_NOTIFY.EXPIRED]);
  });

  it("uses the existing-user copy", () => {
    expect(buildTrialEmail(TRIAL_NOTIFY.EXISTING_EXPIRED).subject).toBe("Your Paidly trial has ended");
    expect(buildTrialEmail(TRIAL_NOTIFY.EXISTING_EXPIRED).ctaLabel).toBe("Subscribe to Paidly");
    expect(buildTrialEmail(TRIAL_NOTIFY.EXISTING_EXPIRED, { name: "Thandi Nkosi" }).paragraphs).toEqual([
      "Hi Thandi,",
      "Your Paidly trial has ended.",
      "Your account and business information are still available.",
      "Subscribe to Paidly to continue managing your business with invoicing, quotes, expenses, POS and more.",
    ]);
    expect(buildTrialEmail(TRIAL_NOTIFY.EXISTING_FOLLOWUP).subject).toBe("Ready to continue with Paidly?");
    expect(buildTrialEmail(TRIAL_NOTIFY.EXISTING_FOLLOWUP).ctaLabel).toBe("Choose a Plan");
  });
});

describe("admin migration actions", () => {
  it("only write migration columns", () => {
    for (const body of [
      { action: "migration_exclude", reason: "VIP" },
      { action: "migration_include" },
      { action: "migration_reset" },
      { action: "migration_mark_reviewed" },
      { action: "migration_override", status: "MIGRATED_SUBSCRIBED" },
    ]) {
      const { patch } = buildMigrationAdminPatch(sub(), body, { now: NOW, actorId: "admin-1" });
      for (const key of Object.keys(patch)) expect(key).toMatch(/^(trial_migration_|migration_)/);
    }
  });

  it("marks expired only an account without access, with no grace unless asked", () => {
    const { patch } = buildMigrationAdminPatch(sub(), { action: "migration_override", status: "MIGRATED_EXPIRED" }, { now: NOW });
    expect(patch.migration_grace_ends_at).toBeUndefined();
    const withGrace = buildMigrationAdminPatch(sub(), { action: "migration_override", status: "MIGRATED_EXPIRED", grace_days: 7 }, { now: NOW });
    expect(withGrace.patch.migration_grace_ends_at).toBe(at(7));
    const live = sub({ status: "active", subscription_source: "payfast", payfast_token: "t" });
    expect(() =>
      buildMigrationAdminPatch(live, { action: "migration_override", status: "MIGRATED_EXPIRED" }, { now: NOW })
    ).toThrow(/still has access/);
    expect(() => buildMigrationAdminPatch(sub(), { action: "migration_override", status: "LOCKED" }, { now: NOW })).toThrow();
  });
});
