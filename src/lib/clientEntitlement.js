/**
 * Client entitlement snapshot — mirrors GET /api/subscriptions/current.
 * UX / EntityManager only. Server assertUserHasFeature / requireFeature remain SoR.
 */
import { familyForSlug, hasFeature } from "@/lib/plans";

/** @type {{ ready: boolean, accessGranted: boolean | null, planSlug: string | null, planFamily: string | null, source: string }} */
let snapshot = {
  ready: false,
  accessGranted: null,
  planSlug: null,
  planFamily: null,
  source: "unset",
};

/**
 * @param {{
 *   ready?: boolean,
 *   accessGranted?: boolean | null,
 *   planSlug?: string | null,
 *   planFamily?: string | null,
 *   source?: string,
 * }} next
 */
export function publishClientEntitlement(next) {
  snapshot = {
    ready: Boolean(next?.ready),
    accessGranted: next?.accessGranted ?? null,
    planSlug: next?.planSlug != null ? String(next.planSlug).trim() || null : null,
    planFamily: next?.planFamily != null ? String(next.planFamily).trim() || null : null,
    source: String(next?.source || "subscription"),
  };
}

export function getClientEntitlementSnapshot() {
  return snapshot;
}

export function resetClientEntitlementForTests() {
  snapshot = {
    ready: false,
    accessGranted: null,
    planSlug: null,
    planFamily: null,
    source: "unset",
  };
}

/**
 * Derive UI/write entitlement from /api/subscriptions/current payload.
 * Reads the server-built `entitlement` block (same resolver as the server feature gates).
 * profiles.plan is never an input: before the subscription loads the snapshot is simply not ready.
 * @param {object | null | undefined} data
 */
export function deriveEntitlementFromSubscriptionCurrent(data) {
  if (!data || typeof data !== "object") {
    return { ...EMPTY_DETAIL, ready: false, accessGranted: null, planSlug: null, planFamily: null, source: "loading" };
  }

  const e = data.entitlement && typeof data.entitlement === "object" ? data.entitlement : null;
  const accessGranted = e ? e.accessGranted === true : data.accessGranted === true;
  // Subscribed package, shown even without access ("Growth — trial expired").
  const subscribedFamily = e
    ? e.plan || null
    : familyForSlug(data.planFamily || data.currentPlan || data.plan) || null;

  return {
    ready: true,
    accessGranted,
    planSlug: accessGranted ? subscribedFamily : null,
    planFamily: accessGranted ? subscribedFamily : null,
    source: "subscription",
    subscribedPlan: subscribedFamily,
    status: e?.status ?? data.currentStatus ?? data.status ?? null,
    trialing: Boolean(e?.trialing),
    trialEndsAt: e?.trialEndsAt ?? data.trialEndsAt ?? null,
    trialDaysRemaining: e?.trialDaysRemaining ?? null,
    inGrace: Boolean(e?.inGrace),
    limits: e?.limits ?? null,
  };
}

const EMPTY_DETAIL = Object.freeze({
  subscribedPlan: null,
  status: null,
  trialing: false,
  trialEndsAt: null,
  trialDaysRemaining: null,
  inGrace: false,
  limits: null,
});

/**
 * Same rule as server assertUserHasFeature once SoR is ready:
 * no access → deny; with access → family/slug features.
 * While not ready, return true (no lock flash); never falls back to profiles.plan.
 * @param {string} feature
 * @param {{ snapshot?: typeof snapshot }} [opts]
 */
export function clientHasFeature(feature, opts = {}) {
  const s = opts.snapshot || snapshot;
  const key = String(feature || "").trim();
  if (!key) return false;

  // Not loaded yet: don't flash locks. The server gates enforce regardless of this answer.
  if (!s.ready) return true;

  if (!s.accessGranted) return false;
  const slug = s.planSlug || s.planFamily;
  if (!slug) return false;
  return hasFeature(slug, key);
}

/**
 * Plan string for FeatureGate / nav labels once SoR is ready.
 * Without access → "none" (hasFeature maps none→starter for catalog math, but
 * callers must use clientHasFeature which denies when !accessGranted).
 */
export function clientPlanSlugForDisplay(opts = {}) {
  const s = opts.snapshot || snapshot;
  if (!s.ready || !s.accessGranted) return "none";
  return s.planSlug || s.planFamily || "none";
}

const FAMILY_LABEL = { starter: "Starter", business: "Business", growth: "Growth", enterprise: "Enterprise" };

/**
 * Package label + status line for badges (sidebar account, plan page, billing page).
 * @param {ReturnType<typeof deriveEntitlementFromSubscriptionCurrent>} e
 * @returns {{ plan: string | null, planLabel: string, statusLabel: string }}
 */
export function describeEntitlementBadge(e) {
  if (!e?.ready) return { plan: null, planLabel: "", statusLabel: "" };
  const plan = e.subscribedPlan || null;
  const planLabel = plan ? FAMILY_LABEL[plan] || plan : "No subscription";
  if (!plan) return { plan, planLabel, statusLabel: "Choose a plan" };
  if (e.accessGranted && e.trialing) {
    const d = e.trialDaysRemaining;
    return { plan, planLabel, statusLabel: d == null ? "Trial" : `Trial — ${d} day${d === 1 ? "" : "s"} left` };
  }
  if (e.accessGranted && e.inGrace) return { plan, planLabel, statusLabel: "Payment overdue" };
  if (e.accessGranted) {
    return { plan, planLabel, statusLabel: e.status === "cancelled" ? "Cancelled — active until period end" : "Active" };
  }
  const st = String(e.status || "");
  if (st === "trialing" || st === "expired") return { plan, planLabel, statusLabel: "Trial expired" };
  if (st === "pending" || st === "processing") return { plan, planLabel, statusLabel: "Awaiting payment" };
  if (st === "suspended") return { plan, planLabel, statusLabel: "Suspended" };
  if (st === "cancelled") return { plan, planLabel, statusLabel: "Cancelled" };
  if (st === "failed" || st === "past_due") return { plan, planLabel, statusLabel: "Payment failed" };
  return { plan, planLabel, statusLabel: "Inactive" };
}

/**
 * Full-app lock: the company has a subscription and it no longer grants access.
 * No subscription row (legacy accounts) and pending checkouts are not locked here.
 * @param {ReturnType<typeof deriveEntitlementFromSubscriptionCurrent>} e
 */
export function isEntitlementLapsed(e) {
  if (!e?.ready || e.accessGranted) return false;
  if (!e.subscribedPlan) return false;
  return ["trialing", "expired", "suspended", "failed", "cancelled", "past_due"].includes(String(e.status || ""));
}
