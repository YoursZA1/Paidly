/**
 * Profile plan helpers — `profiles.plan` / `profiles.subscription_plan` are lowercase slugs.
 * Free trial: org owners created on/after 2026-08-20 UTC get a 7-day server-side trial
 * (`subscriptions.status = trialing`, `trial_ends_at = created_at + 7 days`). Profiles cache
 * `subscription_status = trial`. Dates are never taken from the browser.
 * Paid: `subscription_status = active` after verified PayFast ITN.
 *
 * `profiles.subscription_status`: trial | active | expired | cancelled | past_due | suspended.
 *
 * Billing columns are written only by the server webhook (service role) or DB trigger. The app reads them for UI; do not
 * `update()` them from the client (see `updateMyUserData` billing-field strip in `customClient.js`).
 */

const FREEISH = new Set(["free", "trial", "none", ""]);

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

/** Any slug we treat as a paid subscription tier. */
export function isPaidTierSlug(slug) {
  const s = String(slug || "").trim().toLowerCase();
  if (!s || FREEISH.has(s)) return false;
  return (
    s === "individual" ||
    s === "sme" ||
    s === "corporate" ||
    s === "starter" ||
    s === "business" ||
    s === "growth" ||
    s === "enterprise" ||
    s === "professional" ||
    s === "pro" ||
    s.startsWith("starter_") ||
    s.startsWith("business_") ||
    s.startsWith("growth_") ||
    s === "enterprise_custom"
  );
}

/**
 * Marketing / upgrade UI: Business tier and above.
 */
export function isProPlan(profile) {
  const s = slugFromProfile(profile);
  if (s === "pro") return true;
  return (
    s === "sme" ||
    s === "corporate" ||
    s === "professional" ||
    s === "business" ||
    s === "growth" ||
    s === "enterprise" ||
    s.startsWith("business_") ||
    s.startsWith("growth_") ||
    s === "enterprise_custom"
  );
}

/**
 * Billing lock for Layout: expired / cancelled / suspended, or past_due outside grace.
 * Profiles cache: subscription_status past_due may still have is_pro during grace.
 */
export function isSubscriptionExpired(profileOrUser) {
  if (!profileOrUser || typeof profileOrUser !== "object") return false;
  const st = String(profileOrUser.subscription_status || "").toLowerCase();
  if (st === "expired" || st === "cancelled" || st === "canceled" || st === "suspended" || st === "failed") {
    return true;
  }
  if (st === "trial" || st === "trialing") {
    const raw = profileOrUser.trial_ends_at;
    if (raw == null || raw === "") return false;
    const end = new Date(raw);
    if (!Number.isFinite(end.getTime())) return false;
    return end.getTime() <= Date.now();
  }
  if (st === "past_due") {
    // During grace, profile.is_pro may still be true (DB trigger).
    if (profileOrUser.is_pro === true) return false;
    return true;
  }
  return false;
}

/** True while subscription_status is trial/trialing and trial_ends_at is unset or still in the future. */
export function isOnTrialSubscription(profile) {
  if (!profile) return false;
  const st = String(profile.subscription_status || "").toLowerCase();
  if (st !== "trial" && st !== "trialing") return false;
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
 * Maps profile slugs (and previous catalog names) to starter | business | growth | enterprise.
 */
export function normalizePaidPackageKey(planOrProfile) {
  const raw =
    typeof planOrProfile === "object" && planOrProfile
      ? slugFromProfile(planOrProfile)
      : String(planOrProfile ?? "").trim().toLowerCase();
  if (!raw || raw === "none") return "none";
  if (
    ["individual", "starter", "free", "basic", "trial"].includes(raw) ||
    raw.startsWith("starter_")
  ) {
    return "starter";
  }
  if (
    ["sme", "professional", "business", "pro"].includes(raw) ||
    raw.startsWith("business_")
  ) {
    return "business";
  }
  if (["corporate", "growth"].includes(raw) || raw.startsWith("growth_")) {
    return "growth";
  }
  if (["enterprise", "enterprise_custom"].includes(raw)) return "enterprise";
  return "none";
}

const PACKAGE_LABELS = {
  starter: "Starter",
  business: "Business",
  growth: "Growth",
  enterprise: "Enterprise",
  individual: "Starter",
  sme: "Business",
  corporate: "Growth",
  none: "—",
};

export function getPackageDisplayName(packageKey) {
  return PACKAGE_LABELS[packageKey] || "—";
}

/**
 * Prefer the row PayFast / the app should treat as “current” when multiple `subscriptions` rows exist per user.
 */
export function pickPreferredSubscriptionRow(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const score = (s) => {
    const x = String(s?.status || "").toLowerCase();
    if (x === "active") return 6;
    if (x === "trialing" || x === "trial") return 5;
    if (x === "past_due") return 4;
    if (x === "pending" || x === "processing") return 2;
    if (x === "inactive") return 2;
    if (x === "canceled" || x === "cancelled" || x === "expired" || x === "failed" || x === "suspended") return 1;
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
      packageKey: "none",
      packageLabel: "—",
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
  if (st === "trial" || st === "trialing") {
    if (isOnTrialSubscription(profile)) {
      const raw = profile.trial_ends_at;
      const end = raw ? new Date(raw) : null;
      const days =
        end && Number.isFinite(end.getTime())
          ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
          : null;
      statusLabel =
        days == null ? "Free Trial" : `Free Trial · ${days} day${days === 1 ? "" : "s"} remaining`;
    } else {
      statusLabel = "Trial expired";
    }
  } else if (st === "active") {
    statusLabel =
      profile.subscription_source === "admin" || profile.admin_override
        ? "Active · Managed by administrator"
        : hasActivePaidSubscription(profile)
          ? "Paid · Active"
          : "Active";
  } else if (st === "expired") {
    statusLabel = "Trial expired";
  } else if (st === "past_due") {
    statusLabel = "Past due";
  } else if (st === "cancelled" || st === "canceled") {
    statusLabel = "Cancelled";
  } else if (st === "suspended") {
    statusLabel = "Suspended";
  } else if (st === "failed") {
    statusLabel = "Payment failed";
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
