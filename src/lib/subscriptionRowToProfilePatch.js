import { normalizePaidPackageKey } from "@/lib/subscriptionPlan";

/**
 * Maps an admin-managed `subscriptions` row to a `profiles` update payload.
 * Pure: pass `updatedAtIso` explicitly (e.g. `new Date().toISOString()` from the caller).
 *
 * @param {object | null | undefined} row
 * @param {string} updatedAtIso - ISO timestamp for `profiles.updated_at`
 * @returns {{ userId: string, patch: object } | null}
 */
export function subscriptionRowToProfilePatch(row, updatedAtIso) {
  if (!row || typeof row !== "object") return null;

  const userId = row.user_id;
  if (userId == null || String(userId).trim() === "") return null;

  const rawCombined = String(row.plan || row.current_plan || row.subscription_plan || "").trim();
  if (!rawCombined) return null;

  const planRaw = normalizePaidPackageKey({
    plan: row.plan || row.current_plan || rawCombined,
    subscription_plan: row.subscription_plan || row.plan || row.current_plan || rawCombined,
  });

  if (typeof updatedAtIso !== "string" || !updatedAtIso.trim()) {
    throw new TypeError("subscriptionRowToProfilePatch: updatedAtIso must be a non-empty ISO string");
  }

  const st = String(row.status ?? "active").trim().toLowerCase();
  let subscription_status = "inactive";
  if (st === "active") subscription_status = "active";
  else if (st === "paused") subscription_status = "inactive";
  else if (st === "cancelled" || st === "canceled") subscription_status = "cancelled";
  else if (st === "expired") subscription_status = "expired";
  else if (st === "past_due") subscription_status = "past_due";

  const patch = {
    plan: planRaw,
    subscription_plan: planRaw,
    subscription_status,
    updated_at: updatedAtIso,
  };

  if (subscription_status === "active") {
    patch.trial_ends_at = null;
    patch.is_pro = true;
  } else {
    patch.is_pro = false;
  }

  return { userId: String(userId), patch };
}
