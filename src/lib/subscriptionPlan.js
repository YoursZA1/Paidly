/**
 * Profile plan helpers — `profiles.plan` / `profiles.subscription_plan` are lowercase slugs.
 * Free trial: plan = individual, subscription_status = trial, trial_ends_at set (see `handle_new_user` migration).
 * Paid: subscription_status = active; tier from PayFast ITN (individual | sme | corporate). Literal `"pro"` is supported if you store it elsewhere.
 *
 * `profiles.subscription_status`: trial | active | expired | cancelled (see migration comments).
 *
 * Billing columns are written only by the server webhook (service role) or DB trigger. The app reads them for UI; do not
 * `update()` them from the client (see `updateMyUserData` billing-field strip in `customClient.js`).
 */

const FREEISH = new Set(["free", "starter", "trial", "none", ""]);

export function slugFromProfile(profile) {
  if (!profile || typeof profile !== "object") return "";
  /** Prefer `subscription_plan` (PayFast / `subscriptions` sync); then `plan` (legacy or mirror). */
  const raw =
    profile.subscription_plan ??
    profile.subscriptionPlan ??
    profile.plan ??
    "";
  return String(raw).trim().toLowerCase();
}

/** Any slug we treat as a paid subscription tier (includes Individual paid tier). */
export function isPaidTierSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s || FREEISH.has(s)) return false;
  return (
    s === "individual" ||
    s === "sme" ||
    s === "corporate" ||
    s === "professional" ||
    s === "business" ||
    s === "enterprise" ||
    s === "pro"
  );
}

/**
 * Marketing / upgrade UI: SME tier and above (excludes solo Individual if you want only "Pro" label).
 * Includes literal `pro` and Paidly `sme` / `corporate` / enterprise-style slugs.
 */
export function isProPlan(profile) {
  const s = slugFromProfile(profile);
  if (s === "pro") return true;
  return (
    s === "sme" ||
    s === "corporate" ||
    s === "professional" ||
    s === "business" ||
    s === "enterprise"
  );
}

/** Billing ended without an active paid subscription (see trial expiry RPC / admin). */
export function isSubscriptionExpired(profileOrUser) {
  if (!profileOrUser || typeof profileOrUser !== "object") return false;
  return String(profileOrUser.subscription_status || "").toLowerCase() === "expired";
}

/** True while subscription_status is trial and trial_ends_at is unset or still in the future. */
export function isOnTrialSubscription(profile) {
  if (!profile) return false;
  const st = String(profile.subscription_status || "").toLowerCase();
  if (st !== "trial") return false;
  const raw = profile.trial_ends_at;
  if (raw == null || raw === "") return true;
  const end = new Date(raw);
  if (!Number.isFinite(end.getTime())) return true;
  return end.getTime() > Date.now();
}

/**
 * Paid access: must be subscription_status active (trial with plan individual is NOT paid).
 * After successful PayFast ITN, status is active and plan is the paid tier slug.
 */
export function hasActivePaidSubscription(profile) {
  if (!profile) return false;
  const status = String(profile.subscription_status || "").toLowerCase();
  if (status !== "active") return false;
  return isPaidTierSlug(slugFromProfile(profile));
}

/**
 * Load latest profile row (same idea as your snippet). Prefer RLS-authenticated client.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} userId
 */
export async function fetchUserProfile(supabase, userId) {
  if (!supabase || !userId) return { data: null, error: new Error("missing supabase or userId") };
  return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
}

/**
 * Canonical Paidly product package for admin subscriptions UI, PayFast tiers, and pricing cards.
 * Maps profile slugs (and legacy names) to `individual` | `sme` | `corporate`.
 */
export function normalizePaidPackageKey(planOrProfile) {
  const raw =
    typeof planOrProfile === "object" && planOrProfile
      ? slugFromProfile(planOrProfile)
      : String(planOrProfile ?? "").trim().toLowerCase();
  if (
    ["individual", "starter", "free", "basic", "trial", "none", ""].includes(raw)
  ) {
    return "individual";
  }
  if (["sme", "professional", "business"].includes(raw)) return "sme";
  if (["corporate", "enterprise", "pro"].includes(raw)) return "corporate";
  return "individual";
}

const PACKAGE_LABELS = {
  individual: "Individual",
  sme: "SME",
  corporate: "Corporate",
};

export function getPackageDisplayName(packageKey) {
  return PACKAGE_LABELS[packageKey] || "Individual";
}

/**
 * Prefer the row PayFast / the app should treat as “current” when multiple `subscriptions` rows exist per user.
 */
export function pickPreferredSubscriptionRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const score = (s) => {
    const x = String(s?.status || "").toLowerCase();
    if (x === "active") return 5;
    if (x === "past_due") return 4;
    if (x === "inactive") return 2;
    if (x === "canceled" || x === "cancelled") return 1;
    if (x === "none" || x === "") return 0;
    return 3;
  };
  return [...rows].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    const tb = new Date(b.created_at || b.created_date || 0).getTime();
    const ta = new Date(a.created_at || a.created_date || 0).getTime();
    return tb - ta;
  })[0];
}

/**
 * Dashboard / settings copy aligned with `profiles.plan`, `profiles.subscription_plan`, `profiles.subscription_status`.
 */
export function describeSubscriptionState(profile) {
  if (!profile || typeof profile !== "object") {
    return {
      packageKey: "individual",
      packageLabel: "Individual",
      statusLabel: "—",
      rawSlug: "",
      subscriptionStatus: "",
    };
  }
  const raw = slugFromProfile(profile);
  const st = String(profile.subscription_status || "").toLowerCase() || "inactive";
  const packageKey = normalizePaidPackageKey(profile);
  let packageLabel = getPackageDisplayName(packageKey);
  if (raw === "free" && st !== "active" && st !== "trial") {
    packageLabel = "Free";
  }

  let statusLabel = "Inactive";
  if (st === "trial") {
    statusLabel = isOnTrialSubscription(profile) ? "Trial" : "Trial ended";
  } else if (st === "active") {
    statusLabel = hasActivePaidSubscription(profile) ? "Paid · Active" : "Active";
  } else if (st === "expired") {
    statusLabel = "Expired";
  } else if (st === "past_due") {
    statusLabel = "Past due";
  } else if (st === "cancelled" || st === "canceled") {
    statusLabel = "Cancelled";
  } else if (st === "inactive") {
    statusLabel = "No active subscription";
  }

  return {
    packageKey,
    packageLabel,
    statusLabel,
    rawSlug: raw,
    subscriptionStatus: st,
  };
}
