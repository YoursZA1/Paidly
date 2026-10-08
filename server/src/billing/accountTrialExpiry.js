/**
 * Anchor genuine trials to account creation + the configured trial length, then mark
 * overdue ones expired. Runs inside the existing expire-trials cron. Does not email;
 * the trial conversion batch sends TRIAL_EXPIRED once.
 */

import { decideAccountTrial } from "../../../shared/accountTrialCheck.js";
import { hasFreeAccess } from "../../../shared/trialLifecycle.js";

const SELECT_RICH =
  "id, user_id, company_id, status, trial_ends_at, trial_started_at, subscription_source, admin_override, free_access, free_access_until, payfast_token, created_at, migration_excluded";
const SELECT_BASE = SELECT_RICH.replace(", free_access, free_access_until", "").replace(", migration_excluded", "");

async function loadTrialRows(supabase, limit) {
  let res = await supabase
    .from("subscriptions")
    .select(SELECT_RICH)
    .in("status", ["trialing", "trial"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (res.error && /free_access|migration_excluded|column|schema cache/i.test(String(res.error.message || ""))) {
    res = await supabase
      .from("subscriptions")
      .select(SELECT_BASE)
      .in("status", ["trialing", "trial"])
      .order("created_at", { ascending: true })
      .limit(limit);
  }
  return res;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ now?: Date, limit?: number }} [opts]
 */
export async function applyAccountCreationTrials(supabase, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const limit = Math.min(400, Math.max(1, Number(opts.limit) || 200));
  const loaded = await loadTrialRows(supabase, limit);
  if (loaded.error) throw loaded.error;
  const trials = loaded.data || [];
  if (trials.length === 0) return { checked: 0, expired: 0, anchored: 0, skipped: 0 };

  const userIds = [...new Set(trials.map((row) => row.user_id).filter(Boolean))];
  const companyIds = [...new Set(trials.map((row) => row.company_id).filter(Boolean))];

  const createdAtByUser = new Map();
  if (userIds.length) {
    const profiles = await supabase.from("profiles").select("id, created_at").in("id", userIds);
    for (const profile of profiles.data || []) {
      if (profile.created_at) createdAtByUser.set(profile.id, profile.created_at);
    }
  }

  const activeCompanies = new Set();
  if (companyIds.length) {
    const siblings = await supabase
      .from("subscriptions")
      .select("id, company_id, status, free_access, free_access_until, subscription_source, admin_override")
      .in("company_id", companyIds)
      .in("status", ["active", "past_due"])
      .limit(500);
    for (const row of siblings.error ? [] : siblings.data || []) {
      if (row.status === "active" || hasFreeAccess(row, now)) activeCompanies.add(row.company_id);
    }
  }

  let expired = 0;
  let anchored = 0;
  let skipped = 0;

  for (const row of trials) {
    if (row.company_id && activeCompanies.has(row.company_id)) {
      skipped += 1;
      continue;
    }
    const decision = decideAccountTrial(
      {
        ...row,
        accountCreatedAt: createdAtByUser.get(row.user_id) || row.created_at,
      },
      now
    );
    if (decision.action === "skip" || decision.action === "unchanged") {
      skipped += 1;
      continue;
    }
    const patch = {
      trial_ends_at: decision.trialEndsAt,
      updated_at: now.toISOString(),
    };
    if (decision.setStartedAt) patch.trial_started_at = decision.setStartedAt;
    if (decision.action === "expire") patch.status = "expired";
    // Same subscription row. Trial expiry must not insert another record.
    const { error } = await supabase.from("subscriptions").update(patch).eq("id", row.id).eq("status", row.status);
    if (error) {
      console.warn("[account-trial] update failed:", error.message);
      skipped += 1;
      continue;
    }
    if (decision.action === "expire") expired += 1;
    else anchored += 1;
  }

  return { checked: trials.length, expired, anchored, skipped };
}
