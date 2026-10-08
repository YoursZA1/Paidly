/**
 * Existing-user trial migration — server side. Admin only (callers check requireBillingAdmin).
 *
 * previewTrialMigration reads and classifies; it writes nothing. runTrialMigration writes the same
 * decisions, only to the trial_migration_* and migration_grace_* columns, and only on rows that have
 * no decision yet (or were waiting for review), so running it twice changes nothing the second time.
 * Emails are sent by the daily expire-trials job, never from the admin request.
 */

import {
  MIGRATION_OVERRIDE_STATUSES,
  MIGRATION_STATUS,
  buildMigrationGroups,
  classifyMigrationGroup,
  migrationFingerprint,
  normalizeGraceDays,
  summarizeMigration,
} from "../../../shared/trialMigration.js";
import { addCalendarDaysIso } from "../../../shared/subscriptionAccess.js";
import { accessWithoutMigration } from "../../../shared/trialLifecycle.js";

const PAGE = 1000;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function readAll(supabase, table, columns) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

/** Grace length from the request, then MIGRATION_GRACE_DAYS, then 7. */
export function resolveGraceDays(raw) {
  return normalizeGraceDays(raw ?? process.env.MIGRATION_GRACE_DAYS);
}

async function loadGroups(supabase) {
  let orgs = await readAll(supabase, "organizations", "id, name, owner_id, is_demo, created_at");
  if (orgs.error) orgs = await readAll(supabase, "organizations", "id, name, owner_id, created_at");
  if (orgs.error) throw httpError(500, "Could not read companies");
  const subs = await readAll(supabase, "subscriptions", "*");
  if (subs.error) throw httpError(500, "Could not read subscriptions");
  const profiles = await readAll(supabase, "profiles", "id, full_name, email, subscription_status");
  if (profiles.error) throw httpError(500, "Could not read profiles");
  // Payment evidence only; an unreadable table counts as no payments, which can only add review flags.
  const payments = await readAll(supabase, "payment_history", "*");
  const migrationReady = subs.data.length === 0 || "trial_migration_status" in (subs.data[0] || {});
  return {
    groups: buildMigrationGroups({
      organizations: orgs.data,
      subscriptions: subs.data,
      profiles: profiles.data,
      payments: payments.error ? [] : payments.data,
    }),
    subsById: new Map(subs.data.map((row) => [row.id, row])),
    migrationReady,
  };
}

/** Fields the admin UI needs from the target row. No payment tokens. */
function publicRow(row, result) {
  if (!row) return null;
  return {
    id: row.id,
    user_id: row.user_id || null,
    company_id: row.company_id || null,
    status: row.status,
    plan: row.plan || row.plan_slug || null,
    plan_slug: row.plan_slug || null,
    plan_family: row.plan_family || null,
    amount: row.amount ?? null,
    billing_cycle: row.billing_cycle || null,
    next_billing_date: row.next_billing_date || null,
    trial_started_at: row.trial_started_at || null,
    trial_ends_at: row.trial_ends_at || null,
    subscription_source: row.subscription_source || null,
    admin_override: row.admin_override === true,
    free_access: row.free_access === true,
    free_access_until: row.free_access_until || null,
    trial_migration_status: row.trial_migration_status || null,
    trial_migration_at: row.trial_migration_at || null,
    trial_migration_notes: row.trial_migration_notes || null,
    migration_grace_started_at: row.migration_grace_started_at || null,
    migration_grace_ends_at: row.migration_grace_ends_at || null,
    migration_excluded: row.migration_excluded === true,
    migration_exclusion_reason: row.migration_exclusion_reason || null,
    user_email: result.ownerEmail || row.email || "",
    user_name: result.ownerName || "",
    company_name: result.businessName || "",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

/**
 * Dry run: classify every account. Zero writes.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ graceDays?: number, now?: Date }} [opts]
 */
export async function previewTrialMigration(supabase, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const graceDays = resolveGraceDays(opts.graceDays);
  const { groups, subsById, migrationReady } = await loadGroups(supabase);
  const results = groups.map((group) => classifyMigrationGroup(group, { now, graceDays }));
  const rows = results
    .filter((r) => r.skipped !== "demo")
    .map((r) => ({ ...r, subscriptionRow: publicRow(subsById.get(r.targetRowId), r) }));
  return {
    generatedAt: now.toISOString(),
    graceDays,
    migrationReady,
    summary: summarizeMigration(results),
    // The grace length is part of what the admin approved.
    fingerprint: `${graceDays}#${migrationFingerprint(results)}`,
    rows,
  };
}

/**
 * Write the decisions an admin confirmed. Refuses when the accounts changed since the preview.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ graceDays?: number, fingerprint: string, actor?: object, now?: Date }} opts
 */
export async function runTrialMigration(supabase, opts) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const graceDays = resolveGraceDays(opts.graceDays);
  const preview = await previewTrialMigration(supabase, { graceDays, now });
  if (!preview.migrationReady) {
    throw httpError(503, "Apply the existing-user trial migration to the database before running it.");
  }
  if (typeof opts.fingerprint !== "string" || opts.fingerprint !== preview.fingerprint) {
    throw httpError(409, "Accounts changed since the dry run. Run the dry run again and review it before migrating.");
  }

  await writeMigrationAudit(supabase, {
    actor: opts.actor,
    action: "trial_migration_started",
    description: `Admin started the existing-user trial migration (${preview.rows.length} accounts, ${graceDays}-day grace)`,
    metadata: { grace_days: graceDays, summary: preview.summary },
  });

  let written = 0;
  let unchanged = 0;
  const failures = [];
  const classified = [];
  for (const r of preview.rows) {
    if (!r.willWrite || r.alreadyMigrated || r.skipped || !r.proposed) {
      unchanged += 1;
      continue;
    }
    if (r.existingStatus === MIGRATION_STATUS.REQUIRES_REVIEW && r.proposed === MIGRATION_STATUS.REQUIRES_REVIEW) {
      unchanged += 1;
      continue;
    }
    const patch = {
      trial_migration_status: r.proposed,
      trial_migration_at: nowIso,
      trial_migration_previous_status: r.currentStatus,
      trial_migration_notes: r.reasons.length ? r.reasons.join("; ").slice(0, 1000) : null,
    };
    if (r.proposed === MIGRATION_STATUS.MIGRATED_EXPIRED) {
      patch.migration_grace_started_at = nowIso;
      patch.migration_grace_ends_at = addCalendarDaysIso(now, graceDays);
    }
    // Only a row with no decision (or waiting for review) and not excluded. A second run matches nothing.
    const { data, error } = await supabase
      .from("subscriptions")
      .update(patch)
      .eq("id", r.targetRowId)
      .eq("migration_excluded", false)
      .or("trial_migration_status.is.null,trial_migration_status.eq.NOT_REVIEWED,trial_migration_status.eq.REQUIRES_REVIEW")
      .select("id")
      .maybeSingle();
    if (error) {
      failures.push({ key: r.key, error: error.message });
      continue;
    }
    if (!data) {
      unchanged += 1;
      continue;
    }
    written += 1;
    classified.push({
      category: "subscription",
      action: "trial_migration_user_classified",
      description: `${r.businessName || r.ownerEmail || r.key}: ${r.currentPhaseLabel} → ${r.proposed}`,
      before: { status: r.currentStatus, trial_migration_status: r.existingStatus },
      after: {
        status: r.currentStatus,
        trial_migration_status: r.proposed,
        migration_grace_ends_at: patch.migration_grace_ends_at || null,
      },
      actor_id: opts.actor?.id || null,
      actor_email: opts.actor?.email || null,
      actor_name: opts.actor?.user_metadata?.full_name || opts.actor?.email || null,
      actor_role: "admin",
      target_label: r.ownerEmail || r.targetRowId,
      metadata: {
        subscription_id: r.targetRowId,
        user_id: r.userId,
        company_id: r.companyId,
        previous_state: r.currentPhase,
        new_state: r.proposed,
        reasons: r.reasons,
      },
    });
  }
  if (classified.length) {
    for (let i = 0; i < classified.length; i += 200) {
      const { error } = await supabase.from("audit_logs").insert(classified.slice(i, i + 200));
      if (error) console.warn("[trial-migration] classify audit", error.message);
    }
  }

  const result = {
    processed: preview.rows.length,
    written,
    unchanged,
    failed: failures.length,
    failures: failures.slice(0, 10),
    summary: preview.summary,
    graceDays,
    // The run updates only migration columns, so these are structural guarantees, not estimates.
    dataRecordsDeleted: 0,
    subscriptionsReset: 0,
    accountsDeleted: 0,
    completedAt: new Date().toISOString(),
  };
  await writeMigrationAudit(supabase, {
    actor: opts.actor,
    action: "trial_migration_completed",
    description: `Existing-user trial migration finished: ${written} classified, ${unchanged} unchanged, ${failures.length} failed`,
    metadata: result,
  });
  return result;
}

export const MIGRATION_ADMIN_ACTIONS = Object.freeze([
  "migration_exclude",
  "migration_include",
  "migration_reset",
  "migration_mark_reviewed",
  "migration_override",
]);

/**
 * Build the patch for one admin migration action on one subscription row. No status/plan changes.
 * @returns {{ patch: object, auditAction: string, description: string }}
 */
export function buildMigrationAdminPatch(existing, body, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const action = String(body?.action || "").trim().toLowerCase();
  const reason = String(body?.reason || "").trim().slice(0, 500) || null;
  const label = existing?.email || existing?.user_email || existing?.id;

  if (action === "migration_exclude") {
    return {
      patch: {
        migration_excluded: true,
        migration_exclusion_reason: reason,
        migration_excluded_by: opts.actorId || null,
        migration_excluded_at: nowIso,
      },
      auditAction: "trial_migration_user_excluded",
      description: `Admin excluded ${label} from the trial migration${reason ? `: ${reason}` : ""}`,
    };
  }
  if (action === "migration_include") {
    return {
      patch: {
        migration_excluded: false,
        migration_exclusion_reason: null,
        migration_excluded_by: null,
        migration_excluded_at: null,
      },
      auditAction: "trial_migration_user_included",
      description: `Admin removed the trial migration exclusion for ${label}`,
    };
  }
  if (action === "migration_reset") {
    return {
      patch: {
        trial_migration_status: null,
        trial_migration_at: null,
        trial_migration_previous_status: null,
        trial_migration_notes: null,
        migration_grace_started_at: null,
        migration_grace_ends_at: null,
      },
      auditAction: "trial_migration_user_manual_override",
      description: `Admin reset the trial migration for ${label}`,
    };
  }
  if (action === "migration_mark_reviewed") {
    return {
      patch: {
        trial_migration_status: MIGRATION_STATUS.REVIEWED,
        trial_migration_at: nowIso,
        trial_migration_previous_status: existing?.status || null,
        trial_migration_notes: reason || "Reviewed by admin",
      },
      auditAction: "trial_migration_user_manual_override",
      description: `Admin marked ${label} as reviewed`,
    };
  }
  if (action === "migration_override") {
    const status = String(body?.status || "").trim().toUpperCase();
    if (!MIGRATION_OVERRIDE_STATUSES.includes(status)) throw httpError(400, "Choose a valid migration state.");
    const patch = {
      trial_migration_status: status,
      trial_migration_at: nowIso,
      trial_migration_previous_status: existing?.status || null,
      trial_migration_notes: reason || `Set by admin to ${status}`,
    };
    if (status === MIGRATION_STATUS.MIGRATED_EXPIRED) {
      if (accessWithoutMigration(existing, now)) {
        throw httpError(
          409,
          "This account still has access from its subscription or trial. End that first, then mark it expired."
        );
      }
      const graceDays = resolveGraceDays(body?.grace_days);
      patch.migration_grace_started_at = nowIso;
      patch.migration_grace_ends_at = addCalendarDaysIso(now, graceDays);
    }
    return {
      patch,
      auditAction: "trial_migration_user_manual_override",
      description: `Admin set ${label}'s migration state to ${status}`,
    };
  }
  throw httpError(400, `unknown migration action "${action}"`);
}

/** One audit_logs row for migration-level events. */
export async function writeMigrationAudit(supabase, { actor, action, description, target, before, after, metadata }) {
  try {
    await supabase.from("audit_logs").insert({
      category: "subscription",
      action,
      description,
      before: before || {},
      after: after || {},
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_name: actor?.user_metadata?.full_name || actor?.email || null,
      actor_role: "admin",
      target_label: target?.email || target?.id || null,
      metadata: {
        subscription_id: target?.id || null,
        user_id: target?.user_id || null,
        company_id: target?.company_id || null,
        ...(metadata || {}),
      },
    });
  } catch (e) {
    console.warn("[trial-migration] audit", e?.message || e);
  }
}
