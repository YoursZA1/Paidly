/**
 * PayFast ITN — upsert helpers + thin handler that delegates to
 * `billing/payfastItnPipeline.js` (production verify flow for POST /api/payfast/itn).
 *
 * Activation only after verified ITN (never from the SPA).
 * Checkout correlation: `m_payment_id` = `sub_<userId>_<unique>`, `custom_str1` = user id, `custom_str2` = plan.
 */

import {
  isValidUuid,
  parseUserIdFromSubscriptionMPaymentId,
  sanitizeOneLine,
} from "./inputValidation.js";
import { SUBSCRIPTION_STATUS } from "../../shared/subscriptionStatuses.js";
import { normalizePlanSlug } from "./subscriptionPlans.js";

function parsePayfastWhitelist(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Full ITN body in logs — default on in dev, off in production unless PAYFAST_ITN_VERBOSE_LOGS is truthy. */
export function payfastItnVerboseLogsEnabled() {
  const v = String(process.env.PAYFAST_ITN_VERBOSE_LOGS || "").toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return process.env.NODE_ENV !== "production";
}

export function payfastSubscriptionItnIpAllowed(req, getClientIp) {
  const allowed = parsePayfastWhitelist(process.env.PAYFAST_ITN_IP_WHITELIST);
  if (allowed.length === 0) return true;
  const ip = String(getClientIp(req) || "").trim();
  if (!ip) return false;
  return allowed.includes(ip);
}

function addMonthsIso(baseDate, months) {
  const d = new Date(baseDate);
  if (!Number.isFinite(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString();
}

function monthsFromBillingCycle(cycle) {
  const c = String(cycle || "monthly").toLowerCase();
  if (c === "annual") return 12;
  if (c === "biannual") return 6;
  if (c === "quarterly") return 3;
  return 1;
}

function addHoursIso(baseDate, hours) {
  const d = new Date(baseDate);
  if (!Number.isFinite(d.getTime())) return null;
  d.setTime(d.getTime() + Math.max(1, Number(hours || 24)) * 60 * 60 * 1000);
  return d.toISOString();
}

function parsePayfastYyyyMmDdToIso(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Map PayFast item_name (e.g. Individual, SME) → profiles.subscription_plan slug.
 */
export function mapPayfastPlanToProfilePlan(itemName) {
  const t = String(itemName || "")
    .toLowerCase()
    .replace(/\s+plan$/i, "");
  if (t.includes("corporate") || t.includes("enterprise")) return "corporate";
  if (t.includes("sme") || t.includes("professional") || t.includes("business")) return "sme";
  if (t.includes("individual") || t.includes("starter") || t.includes("solo")) return "individual";
  return "individual";
}

function resolvePayfastSubscriptionUserId(payload) {
  const fromStr1 = String(payload.custom_str1 || "").trim();
  if (isValidUuid(fromStr1)) return fromStr1;
  // Legacy ITNs: user id was in custom_str2
  const fromStr2 = String(payload.custom_str2 || "").trim();
  if (isValidUuid(fromStr2)) return fromStr2;
  const fromPaymentId = parseUserIdFromSubscriptionMPaymentId(payload.m_payment_id);
  return fromPaymentId && isValidUuid(fromPaymentId) ? fromPaymentId : "";
}

/** Exported for ITN pipeline (subscription lookup). */
export const resolvePayfastSubscriptionUserIdForExport = resolvePayfastSubscriptionUserId;

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {Record<string, unknown>} payload
 * @param {{
 *   subscriptionIdHint?: string,
 *   companyIdHint?: string|null,
 *   planIdHint?: string|null,
 *   planSlugHint?: string|null,
 *   userIdHint?: string|null,
 * }} [hints]
 */
export async function upsertSubscriptionFromItn(supabase, payload, hints = {}) {
  const hintedUser = String(hints.userIdHint || "").trim();
  const userId = isValidUuid(hintedUser) ? hintedUser : resolvePayfastSubscriptionUserId(payload);
  if (!isValidUuid(userId)) return;

  const paymentStatus = String(payload.payment_status || "").toUpperCase();
  const eventType = String(payload.type || "").toLowerCase();
  const isFreeTrialEvent = eventType === "subscription.free-trial";
  const cycle = String(payload.custom_str3 || "monthly").toLowerCase();
  const planRaw = String(payload.item_name || payload.custom_str2 || "subscription");
  const plan = sanitizeOneLine(planRaw.replace(/\s+plan$/i, ""), 120) || "subscription";
  const token = sanitizeOneLine(
    String(payload.token || payload.token_id || payload.subscription_token || ""),
    256
  );
  const amountNum = Number(payload.amount_gross ?? payload.amount ?? payload.recurring_amount ?? 0);
  const amount = Number.isFinite(amountNum) && amountNum > 0 ? amountNum : null;
  const nowIso = new Date().toISOString();
  const nextBilling =
    parsePayfastYyyyMmDdToIso(payload.next_run) ||
    parsePayfastYyyyMmDdToIso(payload.billing_date) ||
    addMonthsIso(nowIso, monthsFromBillingCycle(cycle));

  const mPaymentId = String(payload.m_payment_id || "").trim();
  const pfPaymentId = sanitizeOneLine(String(payload.pf_payment_id || ""), 128);
  const planSlug =
    normalizePlanSlug(hints.planSlugHint || payload.custom_str2 || plan) ||
    mapPayfastPlanToProfilePlan(planRaw);

  const { data: userSubsRaw } = await supabase
    .from("subscriptions")
    .select(
      "id, failure_count, payfast_token, payfast_subscription_id, retry_interval_hours, max_retry_attempts, last_payment_at, plan, m_payment_id, status, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const userSubs = Array.isArray(userSubsRaw) ? userSubsRaw : [];
  const latest = userSubs[0] ?? null;
  const tokenNorm = String(token || "").trim();
  const isSuccess = paymentStatus === "COMPLETE" || isFreeTrialEvent;

  const matchedByPaymentId = mPaymentId
    ? userSubs.find((r) => String(r.m_payment_id || "").trim() === mPaymentId) || null
    : null;
  const matchedByHint = hints.subscriptionIdHint
    ? userSubs.find((r) => r.id === hints.subscriptionIdHint) || null
    : null;

  let matchedByToken = null;
  if (tokenNorm) {
    matchedByToken =
      userSubs.find(
        (r) =>
          tokenNorm === String(r.payfast_token || "").trim() ||
          tokenNorm === String(r.payfast_subscription_id || "").trim()
      ) ?? null;
  }

  const latestHasNoToken =
    latest &&
    !String(latest.payfast_token || "").trim() &&
    !String(latest.payfast_subscription_id || "").trim();

  /** Prefer pending checkout row (m_payment_id / create hint), then token agreement. */
  const sameAgreementRow =
    matchedByHint ||
    matchedByPaymentId ||
    matchedByToken ||
    (!tokenNorm && latest ? latest : null) ||
    (Boolean(tokenNorm) && latestHasNoToken && latest ? latest : null);

  const isSamePayfastAgreement = Boolean(sameAgreementRow);
  const rowTargetForMutation = sameAgreementRow || (!isSuccess && latest ? latest : null);

  const refRow = sameAgreementRow || latest;
  const suspendAfter = Math.max(
    1,
    Number(refRow?.max_retry_attempts || process.env.PAYFAST_SUBSCRIPTION_SUSPEND_AFTER || 3)
  );
  const retryHours = Math.max(
    1,
    Number(refRow?.retry_interval_hours || process.env.PAYFAST_RETRY_INTERVAL_HOURS || 24)
  );

  const prevFailures = Number((!isSuccess ? rowTargetForMutation : sameAgreementRow)?.failure_count || 0);
  const nextFailures = isSuccess ? 0 : prevFailures + 1;
  // Allowed status vocabulary only (cancelled spelling)
  const status = isSuccess
    ? SUBSCRIPTION_STATUS.ACTIVE
    : nextFailures >= suspendAfter
      ? SUBSCRIPTION_STATUS.CANCELLED
      : SUBSCRIPTION_STATUS.PAST_DUE;

  const shouldStartNewSubscriptionRow =
    isSuccess && !isSamePayfastAgreement && !matchedByPaymentId && !matchedByHint;

  const row = {
    user_id: userId,
    status,
    plan: planSlug,
    current_plan: planSlug,
    plan_slug: planSlug,
    billing_cycle: cycle,
    provider: "payfast",
    updated_at: nowIso,
    ...(hints.companyIdHint ? { company_id: hints.companyIdHint } : {}),
    ...(hints.planIdHint ? { plan_id: hints.planIdHint } : {}),
    ...(amount != null ? { amount, custom_price: amount } : {}),
    ...(token ? { payfast_token: token, payfast_subscription_id: token } : {}),
    ...(pfPaymentId ? { payfast_payment_id: pfPaymentId, last_pf_payment_id: pfPaymentId } : {}),
    ...(mPaymentId ? { m_payment_id: mPaymentId } : {}),
    ...(isSuccess
      ? {
          last_payment_at: isFreeTrialEvent ? refRow?.last_payment_at || null : nowIso,
          next_billing_date: nextBilling,
          started_at: nowIso,
          activated_at: nowIso,
          start_date: shouldStartNewSubscriptionRow || !sameAgreementRow?.id ? nowIso : undefined,
          current_period_start: nowIso,
          current_period_end: nextBilling,
          next_retry_at: null,
          dunning_stage: 0,
          past_due_at: null,
          canceled_at: null,
          cancelled_at: null,
          last_payment_failure_at: null,
        }
      : {
          next_retry_at: addHoursIso(nowIso, retryHours) || nowIso,
          dunning_stage: nextFailures,
          past_due_at: nowIso,
          last_payment_failure_at: nowIso,
        }),
    failure_count: nextFailures,
  };
  Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

  const insertRow = {
    email:
      sanitizeOneLine(String(payload.email_address || ""), 320) ||
      sanitizeOneLine(String(process.env.PAYFAST_SUBSCRIPTION_FALLBACK_EMAIL || ""), 320) ||
      "unknown@paidly.local",
    user_email:
      sanitizeOneLine(String(payload.email_address || ""), 320) ||
      sanitizeOneLine(String(process.env.PAYFAST_SUBSCRIPTION_FALLBACK_EMAIL || ""), 320) ||
      "unknown@paidly.local",
    full_name: sanitizeOneLine(String(payload.name_first || ""), 200) || null,
    user_name: sanitizeOneLine(String(payload.name_first || ""), 200) || null,
    ...row,
    created_at: nowIso,
  };

  if (shouldStartNewSubscriptionRow) {
    const { error: rpcErr } = await supabase.rpc("payfast_itn_replace_user_subscription", {
      p_user_id: userId,
      p_new_row: insertRow,
    });
    if (rpcErr) {
      console.error("[payfast-subscription-itn] replace subscription RPC failed", rpcErr.message);
      throw new Error(rpcErr.message);
    }
  } else if (rowTargetForMutation?.id) {
    const { error: updErr } = await supabase.from("subscriptions").update(row).eq("id", rowTargetForMutation.id);
    if (updErr) {
      console.error("[payfast-subscription-itn] subscriptions update failed", updErr.message);
      throw new Error(updErr.message);
    }
  } else {
    const { error: insErr } = await supabase.from("subscriptions").insert(insertRow);
    if (insErr) {
      console.error("[payfast-subscription-itn] subscriptions insert failed", insErr.message);
      throw new Error(insErr.message);
    }
  }

  if (isSuccess) {
    /** Paid / PayFast-success: canonical profile write (service role). Not callable from the SPA. */
    const profilePlan = planSlug;
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        plan: profilePlan,
        subscription_plan: profilePlan,
        subscription_status: "active",
        trial_ends_at: null,
        is_pro: true,
        updated_at: nowIso,
      })
      .eq("id", userId);
    if (profErr) {
      console.error("[payfast-subscription-itn] profile sync failed", profErr.message);
      throw new Error(profErr.message);
    }
    await syncAuthUserPlanMetadata(supabase, userId, profilePlan);
  }
}

/**
 * Keeps JWT `user_metadata.plan` / `subscription_plan` aligned with `profiles` (optional; failures are logged only).
 */
async function syncAuthUserPlanMetadata(supabase, userId, profilePlan) {
  if (String(process.env.PAYFAST_SYNC_AUTH_USER_METADATA || "true").toLowerCase() === "false") {
    return;
  }
  const admin = supabase.auth?.admin;
  if (!admin?.getUserById || !admin?.updateUserById) return;
  try {
    const { data, error: gErr } = await admin.getUserById(userId);
    if (gErr || !data?.user) return;
    const um = {
      ...(data.user.user_metadata || {}),
      subscription_plan: profilePlan,
      plan: profilePlan,
    };
    const { error: uErr } = await admin.updateUserById(userId, { user_metadata: um });
    if (uErr) {
      console.error("[payfast-subscription-itn] auth user_metadata sync failed", uErr.message);
    }
  } catch (e) {
    console.error("[payfast-subscription-itn] auth user_metadata sync", e?.message || e);
  }
}


/**
 * Production ITN handler — delegates to billing/payfastItnPipeline.js
 * (Receive → save raw → signature → IP → validate → merchant → amount →
 *  subscription → dedupe → update → payment_history → events → 200).
 *
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, getClientIp: (req: unknown) => string }} deps
 */
export function createPayfastSubscriptionItnHandler(deps) {
  return async function handlePayfastSubscriptionItn(req, res) {
    const { createPayfastItnProductionHandler } = await import("./billing/payfastItnPipeline.js");
    const run = createPayfastItnProductionHandler(deps);
    return run(req, res);
  };
}

/** Alias: canonical “webhook” name for PayFast `notify_url`. */
export const createPayfastWebhookHandler = createPayfastSubscriptionItnHandler;
