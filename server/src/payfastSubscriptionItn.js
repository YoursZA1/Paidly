/**
 * PayFast ITN (Instant Transaction Notification) — shared by Express and Vercel (`api/payfast-subscription-itn.js`).
 *
 * Phase 2: verifies signature + IP allowlist, then either records invoice payments (`custom_str1` = `invoice:…`)
 * or upserts `subscriptions` and sets `profiles.subscription_plan` on success / trial (see `upsertSubscriptionFromItn`).
 */

import { assertPayfastPassphraseForItn, verifyPayfastSignature } from "./payfast.js";
import { getPayfastItnPayload } from "./payfastItnBody.js";
import { isValidUuid, sanitizeOneLine } from "./inputValidation.js";
import { recordSubscriptionPaymentCommission } from "./affiliateSubscriptionCommission.js";
import { processPayfastInvoiceItn } from "./payfastInvoiceItn.js";

function parsePayfastWhitelist(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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

export async function upsertSubscriptionFromItn(supabase, payload) {
  const userId = String(payload.custom_str2 || "").trim();
  if (!isValidUuid(userId)) return;

  const paymentStatus = String(payload.payment_status || "").toUpperCase();
  const eventType = String(payload.type || "").toLowerCase();
  const isFreeTrialEvent = eventType === "subscription.free-trial";
  const cycle = String(payload.custom_str3 || "monthly").toLowerCase();
  const planRaw = String(payload.item_name || payload.custom_str1 || "subscription");
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
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, failure_count, retry_interval_hours, max_retry_attempts, last_payment_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const suspendAfter = Math.max(
    1,
    Number(existing?.max_retry_attempts || process.env.PAYFAST_SUBSCRIPTION_SUSPEND_AFTER || 3)
  );
  const retryHours = Math.max(
    1,
    Number(existing?.retry_interval_hours || process.env.PAYFAST_RETRY_INTERVAL_HOURS || 24)
  );

  const prevFailures = Number(existing?.failure_count || 0);
  const isSuccess = paymentStatus === "COMPLETE" || isFreeTrialEvent;
  const nextFailures = isSuccess ? 0 : prevFailures + 1;
  const status = isSuccess ? "active" : nextFailures >= suspendAfter ? "canceled" : "past_due";

  const row = {
    user_id: userId,
    status,
    plan,
    current_plan: plan,
    billing_cycle: cycle,
    provider: "payfast",
    updated_at: nowIso,
    ...(amount != null ? { amount, custom_price: amount } : {}),
    ...(token ? { payfast_token: token } : {}),
    ...(isSuccess
      ? {
          last_payment_at: isFreeTrialEvent ? existing?.last_payment_at || null : nowIso,
          next_billing_date: nextBilling,
          start_date: existing ? undefined : nowIso,
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

  if (existing?.id) {
    const { error: updErr } = await supabase.from("subscriptions").update(row).eq("id", existing.id);
    if (updErr) {
      console.error("[payfast-subscription-itn] subscriptions update failed", updErr.message);
      throw new Error(updErr.message);
    }
  } else {
    const { error: insErr } = await supabase.from("subscriptions").insert({
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
    });
    if (insErr) {
      console.error("[payfast-subscription-itn] subscriptions insert failed", insErr.message);
      throw new Error(insErr.message);
    }
  }

  if (isSuccess) {
    const profilePlan = mapPayfastPlanToProfilePlan(planRaw);
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ subscription_plan: profilePlan, updated_at: nowIso })
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

    try {
      const customStr1 = String(payload.custom_str1 || "");
      if (customStr1.startsWith("invoice:")) {
        await processPayfastInvoiceItn(supabase, payload);
        return res.status(200).send("OK");
      }

      await upsertSubscriptionFromItn(supabase, payload);

      const paymentStatus = String(payload.payment_status || "").toUpperCase();
      const userId = String(payload.custom_str2 || "").trim();
      const paymentAmount = Number(payload.amount_gross ?? payload.amount ?? 0);
      if (paymentStatus === "COMPLETE" && isValidUuid(userId) && Number.isFinite(paymentAmount) && paymentAmount > 0) {
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
