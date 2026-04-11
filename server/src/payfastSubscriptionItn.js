/**
 * PayFast ITN (Instant Transaction Notification) — shared by Express and Vercel (`api/payfast-handler.js`).
 *
 * Avoid common mistakes (keep these true):
 * - Do not trust the browser to set plan/subscription: profiles + subscriptions are updated here (service role), not from the SPA.
 * - Link payment to user: checkout sets `m_payment_id` = `sub_<userId>_<ts>`, `custom_str1` = user id, `custom_str2` = plan; ITN resolves user from those + signature-verified payload.
 * - Verify webhook: `verifyPayfastSignature` before any DB write.
 * - Persist subscription rows: `upsertSubscriptionFromItn` updates/inserts `public.subscriptions` (new-agreement path uses
 *   RPC `payfast_itn_replace_user_subscription` for atomic deactivate+insert) and syncs `profiles` on success.
 *
 * Observability: after a valid signature, logs a compact line in production; full payload when
 *   PAYFAST_ITN_VERBOSE_LOGS=true or NODE_ENV !== 'production'.
 * Invoice path: `custom_str1` = `invoice:…`. Subscription checkout: `custom_str1` = user id, `custom_str2` = plan.
 */

import { assertPayfastPassphraseForItn, verifyPayfastSignature } from "./payfast.js";
import { getPayfastItnPayload } from "./payfastItnBody.js";
import {
  isValidUuid,
  parseUserIdFromSubscriptionMPaymentId,
  sanitizeOneLine,
} from "./inputValidation.js";
import { recordSubscriptionPaymentCommission } from "./affiliateSubscriptionCommission.js";
import { processPayfastInvoiceItn } from "./payfastInvoiceItn.js";

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

export async function upsertSubscriptionFromItn(supabase, payload) {
  const userId = resolvePayfastSubscriptionUserId(payload);
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

  const { data: userSubsRaw } = await supabase
    .from("subscriptions")
    .select(
      "id, failure_count, payfast_token, payfast_subscription_id, retry_interval_hours, max_retry_attempts, last_payment_at, plan, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  const userSubs = Array.isArray(userSubsRaw) ? userSubsRaw : [];
  const latest = userSubs[0] ?? null;
  const tokenNorm = String(token || "").trim();
  const isSuccess = paymentStatus === "COMPLETE" || isFreeTrialEvent;

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

  /** Row representing the same PayFast agreement (recurring / token backfill). */
  const sameAgreementRow =
    matchedByToken ||
    (!tokenNorm && latest ? latest : null) ||
    (Boolean(tokenNorm) && latestHasNoToken && latest ? latest : null);

  /** Success ITN for a new checkout (upgrade/downgrade or first sub) → deactivate others, insert. */
  const isSamePayfastAgreement = Boolean(sameAgreementRow);

  /** Row to UPDATE: same agreement, or (failures only) latest row for dunning when token does not match. */
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
  const status = isSuccess ? "active" : nextFailures >= suspendAfter ? "canceled" : "past_due";

  const shouldStartNewSubscriptionRow = isSuccess && !isSamePayfastAgreement;

  const row = {
    user_id: userId,
    status,
    plan,
    current_plan: plan,
    billing_cycle: cycle,
    provider: "payfast",
    updated_at: nowIso,
    ...(amount != null ? { amount, custom_price: amount } : {}),
    ...(token ? { payfast_token: token, payfast_subscription_id: token } : {}),
    ...(isSuccess
      ? {
          last_payment_at: isFreeTrialEvent ? refRow?.last_payment_at || null : nowIso,
          next_billing_date: nextBilling,
          start_date: shouldStartNewSubscriptionRow || !sameAgreementRow?.id ? nowIso : undefined,
          next_retry_at: null,
          dunning_stage: 0,
          past_due_at: null,
          canceled_at: null,
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
    const profilePlan = mapPayfastPlanToProfilePlan(planRaw);
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
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, getClientIp: (req: unknown) => string }} deps
 */
export function createPayfastSubscriptionItnHandler(deps) {
  const { supabase, getClientIp } = deps;

  return async function handlePayfastSubscriptionItn(req, res) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).send("Method not allowed");
    }

    if (!payfastSubscriptionItnIpAllowed(req, getClientIp)) {
      return res.status(403).send("IP not allowed");
    }

    const passphraseGate = assertPayfastPassphraseForItn();
    if (!passphraseGate.ok) {
      console.error("[payfast-itn]", passphraseGate.error);
      return res.status(503).send("Server misconfigured");
    }

    const payload = getPayfastItnPayload(req);

    const passphrase = process.env.PAYFAST_PASSPHRASE || "";
    const signatureValid = verifyPayfastSignature(payload, passphrase);
    if (!signatureValid) {
      console.warn("[payfast-itn] Invalid or missing PayFast signature (check PAYFAST_PASSPHRASE matches dashboard)");
      return res.status(400).send("Invalid signature");
    }

    // Signature OK — safe to treat fields as from PayFast.
    const paymentStatusUpper = String(payload.payment_status || "").toUpperCase();
    if (payfastItnVerboseLogsEnabled()) {
      console.log("WEBHOOK:", req?.body ?? payload);
      console.log("[payfast-webhook] normalized payload:", payload);
      console.log("[payfast-webhook] payload JSON:", JSON.stringify(payload));
      console.log("[payfast-webhook] payment_status:", paymentStatusUpper || "(empty)");
      if (paymentStatusUpper === "COMPLETE") {
        console.log("[payfast-webhook] COMPLETE — accepted for subscription/invoice processing");
      }
    } else {
      console.log("[payfast-webhook]", {
        payment_status: paymentStatusUpper || null,
        type: payload.type || null,
        m_payment_id: payload.m_payment_id || null,
        pf_payment_id: payload.pf_payment_id || null,
        item_name: payload.item_name || null,
      });
    }

    try {
      const customStr1 = String(payload.custom_str1 || "");
      if (customStr1.startsWith("invoice:")) {
        await processPayfastInvoiceItn(supabase, payload);
        return res.status(200).send("OK");
      }

      /**
       * Subscription notify_url (`/api/payfast/webhook`): mirrors PayFast fields
       *   userId = custom_str1, plan label = custom_str2 (echoed from checkout).
       * On success: upsert `subscriptions` (user_id, plan, status, amount, payfast_subscription_id from `token`)
       * and update `profiles`: plan + subscription_plan slug (individual | sme | corporate), subscription_status active,
       * trial_ends_at cleared. Signature + passphrase are verified above.
       * Non-COMPLETE ITNs still update `subscriptions` for dunning / past_due (beyond a minimal tutorial handler).
       */
      await upsertSubscriptionFromItn(supabase, payload);

      const userId = resolvePayfastSubscriptionUserId(payload);
      const paymentAmount = Number(payload.amount_gross ?? payload.amount ?? 0);
      if (paymentStatusUpper === "COMPLETE" && isValidUuid(userId) && Number.isFinite(paymentAmount) && paymentAmount > 0) {
        try {
          await recordSubscriptionPaymentCommission(supabase, {
            userId,
            grossAmountZar: paymentAmount,
            source: `payfast_sub_itn:${String(payload.pf_payment_id || payload.m_payment_id || "")}`,
          });
        } catch (e) {
          console.error("[payfast-subscription-itn] affiliate commission failed", e?.message || e);
        }
      }
      return res.status(200).send("OK");
    } catch (err) {
      console.error("[payfast-subscription-itn] processing error", err);
      return res.status(500).send("Internal error");
    }
  };
}

/** Alias: canonical “webhook” name for PayFast `notify_url`. */
export const createPayfastWebhookHandler = createPayfastSubscriptionItnHandler;
