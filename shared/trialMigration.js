/**
 * Existing-user trial migration — classification only. Pure: no I/O.
 *
 * One company (an organization plus its owner's company-less rows) is one account. The classifier
 * reads the same subscription rows the entitlement resolver reads and never guesses: anything it
 * cannot place with confidence is REQUIRES_REVIEW. The dry run and the real run both call
 * classifyMigrationGroup, so the preview is exactly what the run writes.
 *
 * The run writes only the trial_migration_* and migration_grace_* columns. It never changes
 * status, plan, dates, payment records, or business data.
 */

import {
  hasSubscriptionAccess,
  isAdminManaged,
  pickAccessSubscriptionRow,
  addCalendarDaysIso,
} from "./subscriptionAccess.js";
import { coerceSubscriptionStatus, SUBSCRIPTION_STATUS } from "./subscriptionStatuses.js";
import {
  TRIAL_PHASE,
  TRIAL_PHASE_LABEL,
  deriveTrialPhase,
  hasFreeAccess,
  pickNotifiableTrialRow,
} from "./trialLifecycle.js";

export const MIGRATION_GRACE_DEFAULT_DAYS = 7;
export const MIGRATION_GRACE_MAX_DAYS = 30;
export const MIGRATION_FOLLOWUP_AFTER_DAYS = 3;

export const MIGRATION_STATUS = Object.freeze({
  NOT_REVIEWED: "NOT_REVIEWED",
  MIGRATED_ACTIVE: "MIGRATED_ACTIVE",
  MIGRATED_ENDING_SOON: "MIGRATED_ENDING_SOON",
  MIGRATED_EXPIRED: "MIGRATED_EXPIRED",
  MIGRATED_SUBSCRIBED: "MIGRATED_SUBSCRIBED",
  MIGRATED_FREE_ACCESS: "MIGRATED_FREE_ACCESS",
  MIGRATED_SUSPENDED: "MIGRATED_SUSPENDED",
  REQUIRES_REVIEW: "REQUIRES_REVIEW",
  REVIEWED: "REVIEWED",
});

export const MIGRATION_STATUS_LABEL = Object.freeze({
  [MIGRATION_STATUS.NOT_REVIEWED]: "Not reviewed",
  [MIGRATION_STATUS.MIGRATED_ACTIVE]: "Migrated · Active trial",
  [MIGRATION_STATUS.MIGRATED_ENDING_SOON]: "Migrated · Ending soon",
  [MIGRATION_STATUS.MIGRATED_EXPIRED]: "Migrated · Expired",
  [MIGRATION_STATUS.MIGRATED_SUBSCRIBED]: "Migrated · Subscribed",
  [MIGRATION_STATUS.MIGRATED_FREE_ACCESS]: "Migrated · Free access",
  [MIGRATION_STATUS.MIGRATED_SUSPENDED]: "Migrated · Suspended",
  [MIGRATION_STATUS.REQUIRES_REVIEW]: "Requires review",
  [MIGRATION_STATUS.REVIEWED]: "Reviewed by admin",
});

/** Statuses an admin can set by hand. MIGRATED_EXPIRED starts a grace period. */
export const MIGRATION_OVERRIDE_STATUSES = Object.freeze([
  MIGRATION_STATUS.MIGRATED_ACTIVE,
  MIGRATION_STATUS.MIGRATED_ENDING_SOON,
  MIGRATION_STATUS.MIGRATED_EXPIRED,
  MIGRATION_STATUS.MIGRATED_SUBSCRIBED,
  MIGRATION_STATUS.MIGRATED_FREE_ACCESS,
  MIGRATION_STATUS.MIGRATED_SUSPENDED,
  MIGRATION_STATUS.REQUIRES_REVIEW,
  MIGRATION_STATUS.REVIEWED,
]);

/** Dashboard buckets, in display order. */
export const MIGRATION_BUCKETS = Object.freeze([
  { key: "active", label: "Active Trials", status: MIGRATION_STATUS.MIGRATED_ACTIVE },
  { key: "ending", label: "Ending Soon", status: MIGRATION_STATUS.MIGRATED_ENDING_SOON },
  { key: "expired", label: "Expired", status: MIGRATION_STATUS.MIGRATED_EXPIRED },
  { key: "subscribed", label: "Subscribers", status: MIGRATION_STATUS.MIGRATED_SUBSCRIBED },
  { key: "free", label: "Free Access", status: MIGRATION_STATUS.MIGRATED_FREE_ACCESS },
  { key: "suspended", label: "Suspended", status: MIGRATION_STATUS.MIGRATED_SUSPENDED },
  { key: "review", label: "Requires Review", status: MIGRATION_STATUS.REQUIRES_REVIEW },
]);

const PHASE_TO_STATUS = Object.freeze({
  [TRIAL_PHASE.TRIAL_ACTIVE]: MIGRATION_STATUS.MIGRATED_ACTIVE,
  [TRIAL_PHASE.TRIAL_ENDING_SOON]: MIGRATION_STATUS.MIGRATED_ENDING_SOON,
  [TRIAL_PHASE.TRIAL_EXPIRED]: MIGRATION_STATUS.MIGRATED_EXPIRED,
  [TRIAL_PHASE.SUBSCRIPTION_ACTIVE]: MIGRATION_STATUS.MIGRATED_SUBSCRIBED,
  [TRIAL_PHASE.PAST_DUE]: MIGRATION_STATUS.MIGRATED_SUBSCRIBED,
  [TRIAL_PHASE.FREE_ACCESS]: MIGRATION_STATUS.MIGRATED_FREE_ACCESS,
  [TRIAL_PHASE.SUSPENDED]: MIGRATION_STATUS.MIGRATED_SUSPENDED,
});

/** Clamp an admin-supplied grace length. */
export function normalizeGraceDays(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return MIGRATION_GRACE_DEFAULT_DAYS;
  return Math.min(MIGRATION_GRACE_MAX_DAYS, Math.floor(n));
}

function invalidDate(raw) {
  if (raw == null || raw === "") return false;
  return !Number.isFinite(new Date(raw).getTime());
}

function paidHistory(row) {
  return Boolean(
    String(row?.payfast_token || row?.payfast_subscription_id || "").trim() ||
      row?.subscription_source === "payfast"
  );
}

function planLabel(row) {
  const raw = String(row?.plan_family || row?.plan || row?.plan_slug || row?.current_plan || "").trim();
  if (!raw) return null;
  const base = raw.split("_")[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/** True while a migration grace period is running on this row. */
export function inMigrationGrace(row, now = new Date()) {
  if (!row?.migration_grace_ends_at) return false;
  const end = new Date(row.migration_grace_ends_at).getTime();
  return Number.isFinite(end) && end > now.getTime();
}

/** The row in a group that already carries a migration decision (newest decision first). */
export function findMigratedRow(rows) {
  const marked = (Array.isArray(rows) ? rows : []).filter(
    (row) => row?.trial_migration_status && row.trial_migration_status !== MIGRATION_STATUS.NOT_REVIEWED
  );
  marked.sort(
    (a, b) => new Date(b.trial_migration_at || 0).getTime() - new Date(a.trial_migration_at || 0).getTime()
  );
  return marked[0] || null;
}

/**
 * Things that make the account's state uncertain. Any reason here means REQUIRES_REVIEW.
 * @param {object[]} rows
 * @param {object} target the row the classification is read from
 * @param {object | null} owner owner profile (display mirror)
 * @param {Date} now
 * @param {boolean} hasPayment a completed payment_history row exists for this company
 */
function conflictReasons(rows, target, owner, now, hasPayment) {
  const reasons = [];
  for (const row of rows) {
    if (coerceSubscriptionStatus(row.status) == null) {
      reasons.push(`Unknown status "${row.status ?? ""}"`);
    }
    if (invalidDate(row.trial_ends_at)) reasons.push("Invalid trial end date");
    if (invalidDate(row.free_access_until)) reasons.push("Invalid free-access end date");
    if (row.free_access !== true && row.free_access_until) {
      reasons.push("Free-access end date without free access");
    }
    if (row.free_access === true && coerceSubscriptionStatus(row.status) === SUBSCRIPTION_STATUS.SUSPENDED) {
      reasons.push("Free access on a suspended subscription");
    }
  }
  const status = coerceSubscriptionStatus(target.status);
  if (
    (status === SUBSCRIPTION_STATUS.TRIALING || status === SUBSCRIPTION_STATUS.EXPIRED) &&
    !target.trial_ends_at &&
    !isAdminManaged(target) &&
    !hasFreeAccess(target, now)
  ) {
    reasons.push("Trial with no end date");
  }
  const anyAccess = rows.some((row) => hasSubscriptionAccess(row, now));
  if (!anyAccess && rows.some(paidHistory)) {
    reasons.push("Paid subscription has lapsed (not a trial)");
  }
  // "Active" with no payment anywhere and no admin grant is not a known subscription.
  const accessRow = rows.find((row) => hasSubscriptionAccess(row, now));
  if (
    accessRow &&
    coerceSubscriptionStatus(accessRow.status) === SUBSCRIPTION_STATUS.ACTIVE &&
    !isAdminManaged(accessRow) &&
    !hasFreeAccess(accessRow, now) &&
    !paidHistory(accessRow) &&
    !String(accessRow.m_payment_id || "").trim() &&
    !hasPayment
  ) {
    reasons.push("Active with no payment on record");
  }
  const mirror = String(owner?.subscription_status || "").trim().toLowerCase();
  if (!anyAccess && mirror === "active") {
    reasons.push("Profile says active but no subscription grants access");
  }
  return [...new Set(reasons)];
}

/**
 * Classify one account. Pure; the caller supplies `now`.
 * @param {{ key: string, companyId?: string | null, userId?: string | null, businessName?: string | null,
 *   ownerName?: string | null, ownerEmail?: string | null, owner?: object | null, rows: object[], isDemo?: boolean,
 *   hasPayment?: boolean }} group
 * @param {{ now?: Date, graceDays?: number }} [opts]
 */
export function classifyMigrationGroup(group, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const graceDays = normalizeGraceDays(opts.graceDays);
  const rows = (Array.isArray(group?.rows) ? group.rows : []).filter(Boolean);
  const base = {
    key: group.key,
    companyId: group.companyId || null,
    userId: group.userId || null,
    businessName: group.businessName || null,
    ownerName: group.ownerName || null,
    ownerEmail: group.ownerEmail || null,
    targetRowId: null,
    currentStatus: null,
    currentPhase: TRIAL_PHASE.NONE,
    currentPhaseLabel: TRIAL_PHASE_LABEL[TRIAL_PHASE.NONE],
    trialEndsAt: null,
    subscription: "None",
    freeAccess: "None",
    proposed: MIGRATION_STATUS.REQUIRES_REVIEW,
    reasons: [],
    notificationRequired: false,
    graceDays: null,
    graceEndsAt: null,
    existingStatus: null,
    alreadyMigrated: false,
    excluded: false,
    skipped: null,
    willWrite: false,
  };

  if (group.isDemo) return { ...base, skipped: "demo", proposed: null };
  if (rows.length === 0) {
    return { ...base, reasons: ["No subscription record"], skipped: "no_row" };
  }

  const accessRow = pickAccessSubscriptionRow(rows, now) || rows[0];
  const accessGranted = hasSubscriptionAccess(accessRow, now);
  // A company without access is read from its trial row, not from a stray pending checkout.
  const target = accessGranted ? accessRow : pickNotifiableTrialRow(rows) || accessRow;
  const phase = deriveTrialPhase(target, now);
  const paidRow = rows.find(
    (row) => hasSubscriptionAccess(row, now) && coerceSubscriptionStatus(row.status) !== SUBSCRIPTION_STATUS.TRIALING
  );
  const freeRow = rows.find((row) => hasFreeAccess(row, now));

  const out = {
    ...base,
    targetRowId: target.id || null,
    currentStatus: target.status || null,
    currentPhase: phase.phase,
    currentPhaseLabel: TRIAL_PHASE_LABEL[phase.phase] || "—",
    trialEndsAt: target.trial_ends_at || null,
    subscription: paidRow && !hasFreeAccess(paidRow, now) && !isAdminManaged(paidRow)
      ? planLabel(paidRow) || "Paid"
      : "None",
    freeAccess: freeRow
      ? freeRow.free_access_until
        ? `Until ${String(freeRow.free_access_until).slice(0, 10)}`
        : "Indefinite"
      : phase.phase === TRIAL_PHASE.FREE_ACCESS
        ? "Admin managed"
        : "None",
  };

  if (rows.some((row) => row.migration_excluded === true)) {
    return { ...out, excluded: true, proposed: null, skipped: "excluded" };
  }

  const migrated = findMigratedRow(rows);
  if (migrated && migrated.trial_migration_status !== MIGRATION_STATUS.REQUIRES_REVIEW) {
    // Already decided. Never re-run a decision: no new grace, no new email, no date change.
    return {
      ...out,
      targetRowId: migrated.id || out.targetRowId,
      proposed: migrated.trial_migration_status,
      existingStatus: migrated.trial_migration_status,
      alreadyMigrated: true,
      graceEndsAt: migrated.migration_grace_ends_at || null,
      reasons: migrated.trial_migration_notes ? [migrated.trial_migration_notes] : [],
    };
  }

  const reasons = conflictReasons(rows, target, group.owner || null, now, group.hasPayment === true);
  let proposed = PHASE_TO_STATUS[phase.phase] || null;
  if (!proposed) reasons.push(`No trial or subscription to classify (status ${target.status || "none"})`);
  if (reasons.length) proposed = MIGRATION_STATUS.REQUIRES_REVIEW;

  const expired = proposed === MIGRATION_STATUS.MIGRATED_EXPIRED;
  return {
    ...out,
    proposed,
    reasons,
    existingStatus: migrated?.trial_migration_status || null,
    notificationRequired: expired,
    graceDays: expired ? graceDays : null,
    graceEndsAt: expired ? addCalendarDaysIso(now, graceDays) : null,
    willWrite: Boolean(target.id),
  };
}

/**
 * Group raw rows into accounts: each organization with its rows plus its owner's company-less rows
 * (the same set company_access_subscription reads), then any remaining company-less rows per user.
 * @param {{ organizations: object[], subscriptions: object[], profiles: object[], payments?: object[] }} data
 */
export function buildMigrationGroups({ organizations = [], subscriptions = [], profiles = [], payments = [] }) {
  const paidKeys = new Set(
    payments
      .filter((p) => /^(completed?|paid|success(ful)?)$/i.test(String(p?.status || "")))
      .flatMap((p) => [p.subscription_id, p.company_id].filter(Boolean))
  );
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const ownedBy = new Map();
  for (const org of organizations) {
    if (org.owner_id && !ownedBy.has(org.owner_id)) ownedBy.set(org.owner_id, org.id);
  }
  const groups = new Map();
  for (const org of organizations) {
    const owner = profileById.get(org.owner_id) || null;
    groups.set(`company:${org.id}`, {
      key: `company:${org.id}`,
      companyId: org.id,
      userId: org.owner_id || null,
      businessName: org.name || null,
      ownerName: owner?.full_name || null,
      ownerEmail: owner?.email || null,
      owner,
      isDemo: org.is_demo === true,
      rows: [],
    });
  }
  for (const row of subscriptions) {
    let key = null;
    if (row.company_id && groups.has(`company:${row.company_id}`)) key = `company:${row.company_id}`;
    else if (!row.company_id && row.user_id && ownedBy.has(row.user_id)) key = `company:${ownedBy.get(row.user_id)}`;
    else key = row.company_id ? `company:${row.company_id}` : `user:${row.user_id || row.id}`;
    if (!groups.has(key)) {
      const owner = profileById.get(row.user_id) || null;
      groups.set(key, {
        key,
        companyId: row.company_id || null,
        userId: row.user_id || null,
        businessName: null,
        ownerName: owner?.full_name || null,
        ownerEmail: owner?.email || row.email || null,
        owner,
        isDemo: false,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  for (const group of groups.values()) {
    group.hasPayment =
      (group.companyId && paidKeys.has(group.companyId)) || group.rows.some((row) => paidKeys.has(row.id));
  }
  return [...groups.values()];
}

/** Count classifications into dashboard buckets. */
export function summarizeMigration(results) {
  const counts = { total: 0, excluded: 0, demo: 0, noRow: 0, alreadyMigrated: 0, notifications: 0 };
  for (const b of MIGRATION_BUCKETS) counts[b.key] = 0;
  counts.reviewed = 0;
  for (const r of results) {
    if (r.skipped === "demo") {
      counts.demo += 1;
      continue;
    }
    counts.total += 1;
    if (r.skipped === "excluded") {
      counts.excluded += 1;
      continue;
    }
    if (r.skipped === "no_row") {
      counts.noRow += 1;
      counts.review += 1;
      continue;
    }
    if (r.alreadyMigrated) counts.alreadyMigrated += 1;
    if (r.proposed === MIGRATION_STATUS.REVIEWED) counts.reviewed += 1;
    const bucket = MIGRATION_BUCKETS.find((b) => b.status === r.proposed);
    if (bucket) counts[bucket.key] += 1;
    if (r.notificationRequired && !r.alreadyMigrated) counts.notifications += 1;
  }
  return counts;
}

/** Stable fingerprint of a preview, so a run can refuse when accounts changed since the admin looked. */
export function migrationFingerprint(results) {
  return results
    .filter((r) => r.willWrite && !r.alreadyMigrated)
    .map((r) => `${r.targetRowId}:${r.proposed}`)
    .sort()
    .join("|");
}

/** Columns every access read needs once the migration is applied. Readers fall back without them. */
export const MIGRATION_ACCESS_COLUMNS =
  "trial_migration_status, trial_migration_at, trial_migration_notes, migration_grace_started_at, migration_grace_ends_at, migration_excluded";
