/**
 * Keep a single is_current subscription per business. Missing column (migration not applied yet)
 * is a no-op: the admin list still chooses the current row in application code.
 */

import { pickCurrentSubscriptionRow } from "../../../shared/currentSubscription.js";

function missingColumn(error) {
  return /column|schema cache|does not exist/i.test(String(error?.message || error || ""));
}

const OWNER_SELECT =
  "id, status, company_id, user_id, free_access, free_access_until, payfast_token, payfast_subscription_id, updated_at, created_at, is_current";
const OWNER_SELECT_BASE =
  "id, status, company_id, user_id, payfast_token, payfast_subscription_id, updated_at, created_at";

async function selectRows(supabase, build) {
  let query = build(supabase.from("subscriptions").select(OWNER_SELECT));
  let { data, error } = await query;
  if (error && missingColumn(error)) {
    ({ data, error } = await build(supabase.from("subscriptions").select(OWNER_SELECT_BASE)));
  }
  if (error) {
    console.warn("[subscriptions] owner load", error.message);
    return [];
  }
  return data || [];
}

/**
 * Rows that belong to one business: the company, plus this user's company-less rows.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ companyId?: string | null, userId?: string | null }} owner
 */
export async function loadOwnerSubscriptionRows(supabase, { companyId, userId } = {}) {
  const company = String(companyId || "").trim();
  const user = String(userId || "").trim();
  const rows = [];
  if (company) {
    rows.push(
      ...(await selectRows(supabase, (q) => q.eq("company_id", company)))
    );
  }
  if (user) {
    const orphans = await selectRows(supabase, (q) => q.eq("user_id", user).is("company_id", null));
    const seen = new Set(rows.map((row) => row.id));
    for (const row of orphans) {
      if (!seen.has(row.id)) rows.push(row);
    }
  }
  return rows;
}

/**
 * Insert a subscription row. `is_current` is omitted when that column is not migrated yet.
 * Pass `is_current: false` for a checkout that must not replace a live agreement.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} row
 */
export async function insertSubscriptionRow(supabase, row) {
  const payload = { ...row };
  let { data, error } = await supabase.from("subscriptions").insert(payload).select("*").single();
  if (error && missingColumn(error) && Object.prototype.hasOwnProperty.call(payload, "is_current")) {
    delete payload.is_current;
    ({ data, error } = await supabase.from("subscriptions").insert(payload).select("*").single());
  }
  return { data, error };
}

/**
 * Flag exactly one row current for this owner. Does not delete anything and does not change
 * updated_at, so history timestamps stay put.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ companyId?: string | null, userId?: string | null }} owner
 */
export async function reconcileOwnerCurrent(supabase, { companyId, userId } = {}) {
  if (!supabase) return { ok: false, skipped: true };
  const rows = await loadOwnerSubscriptionRows(supabase, { companyId, userId });
  if (rows.length === 0) return { ok: true, currentId: null };
  const picked = pickCurrentSubscriptionRow(rows);
  if (!picked?.id) return { ok: true, currentId: null };

  const otherIds = rows.map((row) => row.id).filter((id) => id && id !== picked.id);
  for (let i = 0; i < otherIds.length; i += 100) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ is_current: false })
      .in("id", otherIds.slice(i, i + 100));
    if (error && missingColumn(error)) return { ok: true, skipped: true, currentId: picked.id };
    if (error) {
      console.warn("[subscriptions] clear current", error.message);
      return { ok: false, currentId: picked.id };
    }
  }

  const { error: keepErr } = await supabase
    .from("subscriptions")
    .update({ is_current: true })
    .eq("id", picked.id);
  if (keepErr && missingColumn(keepErr)) return { ok: true, skipped: true, currentId: picked.id };
  if (keepErr) {
    console.warn("[subscriptions] set current", keepErr.message);
    return { ok: false, currentId: picked.id };
  }
  return { ok: true, currentId: picked.id };
}
