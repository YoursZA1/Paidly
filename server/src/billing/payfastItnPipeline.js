/**
 * Production PayFast ITN flow for POST /api/payfast/itn:
 *
 * Receive → Save raw → Signature → Source IP → POST-back VALID → Merchant →
 * Amount → Currency → Subscription → Deduplicate → Update subscription →
 * payment_history → subscription_events → 200
 *
 * Non-negotiable: never trust frontend payment state; verify with PayFast before
 * status changes; DB is SoR; audit every ITN/event; idempotent on pf_payment_id;
 * no merchant secrets on client. See docs/SUBSCRIPTION_BILLING_SCHEMA.md.
 */

import {
  assertPayfastPassphraseForItn,
  getPayfastMerchantCredentialsForMode,
  payfastMode,
} from "../payfast.js";
import { getPayfastItnPayload } from "../payfastItnBody.js";
import { isValidUuid, sanitizeOneLine } from "../inputValidation.js";
import {
  nextBillingFromItn,
  upsertSubscriptionFromItn,
  resolvePayfastSubscriptionUserIdForExport,
} from "../payfastSubscriptionItn.js";
import { cancelPayfastRecurringBilling } from "./payfastRecurringApi.js";
import { SUBSCRIPTION_STATUS } from "../../../shared/subscriptionStatuses.js";
import { PAYMENT_HISTORY_STATUS } from "../../../shared/paymentHistoryStatuses.js";
import { SUBSCRIPTION_EVENT_TYPE } from "../../../shared/subscriptionEventTypes.js";
import { scheduledPlanChangeDue } from "../../../shared/subscriptionPlanChange.js";
import { familyForSlug } from "../subscriptionPlans.js";
import {
  checkPayfastAmount,
  checkPayfastCurrency,
  checkPayfastItnSignature,
  checkPayfastMerchantId,
  isPayfastItnIpAllowed,
  postBackPayfastValidate,
  resolvePayfastItnAllowedIps,
  shouldEnforcePayfastItnIp,
} from "./payfastItnValidate.js";

async function saveItnLog(supabase, row) {
  try {
    const { data, error } = await supabase
      .from("payfast_itn_logs")
      .insert(row)
      .select("id")
      .single();
    if (error) {
      console.warn("[payfast-itn] payfast_itn_logs insert failed", error.message);
      return null;
    }
    return data?.id || null;
  } catch (e) {
    console.warn("[payfast-itn] payfast_itn_logs insert exception", e?.message || e);
    return null;
  }
}

async function updateItnLog(supabase, id, patch) {
  if (!id) return;
  try {
    await supabase.from("payfast_itn_logs").update(patch).eq("id", id);
  } catch (e) {
    console.warn("[payfast-itn] payfast_itn_logs update failed", e?.message || e);
  }
}

async function logWebhook(supabase, entry) {
  try {
    await supabase.from("webhook_logs").insert({
      provider: "payfast",
      direction: "inbound",
      ...entry,
    });
  } catch (e) {
    console.warn("[payfast-itn] webhook_logs insert failed", e?.message || e);
  }
}

async function logSubEvent(supabase, subscriptionId, companyId, eventType, details) {
  if (!subscriptionId) return;
  try {
    await supabase.from("subscription_events").insert({
      subscription_id: subscriptionId,
      company_id: companyId || null,
      event_type: eventType,
      source: "itn",
      details: details || {},
    });
  } catch (e) {
    console.warn("[payfast-itn] subscription_events insert failed", e?.message || e);
  }
}

/**
 * Load pending/matching subscription for ITN (by m_payment_id then user).
 */
async function loadSubscriptionForItn(supabase, payload) {
  const mPaymentId = String(payload.m_payment_id || "").trim();
  if (mPaymentId) {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "id, user_id, created_by, company_id, plan_id, plan_slug, plan, amount, currency, status, m_payment_id, payfast_token"
      )
      .eq("m_payment_id", mPaymentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return { ...data, _matchedBy: "m_payment_id" };
  }

  // Recurring Billing: `token` is PayFast's canonical id for the agreement and is sent on
  // every recurring charge and on cancellation.
  const token = sanitizeOneLine(String(payload.token || ""), 128);
  if (token) {
    const { data } = await supabase
      .from("subscriptions")
      .select(
        "id, user_id, created_by, company_id, plan_id, plan_slug, plan, amount, currency, status, m_payment_id, payfast_token"
      )
      .eq("payfast_token", token)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return { ...data, _matchedBy: "token" };
  }

  const userId = resolvePayfastSubscriptionUserIdForExport(payload);
  if (!isValidUuid(userId)) return null;

  const { data: rows } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, created_by, company_id, plan_id, plan_slug, plan, amount, currency, status, m_payment_id, payfast_token"
    )
    .eq("user_id", userId)
    .in("status", [
      SUBSCRIPTION_STATUS.PENDING,
      SUBSCRIPTION_STATUS.PROCESSING,
      SUBSCRIPTION_STATUS.ACTIVE,
      SUBSCRIPTION_STATUS.PAST_DUE,
      SUBSCRIPTION_STATUS.SUSPENDED,
      SUBSCRIPTION_STATUS.CANCELLED,
      SUBSCRIPTION_STATUS.TRIALING,
    ])
    .order("updated_at", { ascending: false })
    .limit(1);

  return rows?.[0] ? { ...rows[0], _matchedBy: "user" } : null;
}

/**
 * An ITN found only through the user fallback, carrying a PayFast token different from the
 * row's own, belongs to an older agreement that a newer checkout replaced. It must not cancel,
 * fail, or renew the current subscription.
 */
export function isSupersededAgreementItn(sub, payload) {
  if (!sub || sub._matchedBy !== "user") return false;
  const itnToken = String(payload?.token || "").trim();
  const rowToken = String(sub.payfast_token || "").trim();
  return Boolean(itnToken && rowToken && itnToken !== rowToken);
}

/**
 * Queued downgrade that should apply on this successful charge. Tolerates the columns
 * not existing yet (older databases) by returning null.
 */
async function loadDueScheduledChange(supabase, sub) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("scheduled_plan_slug, scheduled_plan_id, scheduled_change_at")
    .eq("id", sub.id)
    .maybeSingle();
  if (error || !data) return null;
  return scheduledPlanChangeDue(data) ? data : null;
}

async function resolveExpectedAmount(supabase, sub) {
  if (sub?.amount != null && Number(sub.amount) > 0) return Number(sub.amount);
  // Include inactive/legacy plan rows (grandfathered renewals)
  if (sub?.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("amount")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (plan?.amount != null) return Number(plan.amount);
  }
  if (sub?.plan_slug) {
    const { data: plan } = await supabase
      .from("plans")
      .select("amount")
      .eq("slug", sub.plan_slug)
      .maybeSingle();
    if (plan?.amount != null) return Number(plan.amount);
  }
  const requireDb =
    String(process.env.VERCEL || "").trim() !== "" ||
    String(process.env.NODE_ENV || "").toLowerCase() === "production";
  if (requireDb) {
    console.warn("[payfast-itn] expected amount unresolved in production — refusing hardcoded fallback");
  }
  return null;
}

const PAYMENT_HISTORY_OPTIONAL = [
  "user_id",
  "plan_slug",
  "provider",
  "payment_type",
  "attempted_at",
  "completed_at",
  "failure_reason",
  "billing_period_start",
  "billing_period_end",
  "metadata",
];

async function insertPaymentHistory(supabase, row) {
  let payload = { ...row };
  let result = await supabase.from("payment_history").insert(payload).select("id").single();
  while (result.error && /column|schema cache|does not exist/i.test(String(result.error.message || ""))) {
    const drop = PAYMENT_HISTORY_OPTIONAL.find((key) => Object.prototype.hasOwnProperty.call(payload, key));
    if (!drop) break;
    delete payload[drop];
    result = await supabase.from("payment_history").insert(payload).select("id").single();
  }
  return result;
}

function mapPaymentHistoryStatus(paymentStatusUpper) {
  if (paymentStatusUpper === "COMPLETE") return PAYMENT_HISTORY_STATUS.COMPLETED;
  if (paymentStatusUpper === "FAILED") return PAYMENT_HISTORY_STATUS.FAILED;
  if (paymentStatusUpper === "CANCELLED" || paymentStatusUpper === "CANCELED") {
    return PAYMENT_HISTORY_STATUS.CANCELLED;
  }
  return PAYMENT_HISTORY_STATUS.PENDING;
}

/**
 * @param {{ supabase: import("@supabase/supabase-js").SupabaseClient, getClientIp: (req: unknown) => string }} deps
 */
export function createPayfastItnProductionHandler(deps) {
  const { supabase, getClientIp } = deps;

  return async function handlePayfastItn(req, res) {
    const started = Date.now();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).send("Method not allowed");
    }

    // 1) Receive ITN
    const payload = getPayfastItnPayload(req);
    const clientIp = String(getClientIp(req) || "").trim();
    const mode = payfastMode();

    // 2) Save raw payload immediately (never trust yet)
    const itnLogId = await saveItnLog(supabase, {
      received_data: payload,
      verification_response: null,
      signature_valid: null,
      amount_valid: null,
      merchant_valid: null,
      verified: false,
    });

    await logWebhook(supabase, {
      path: "/api/payfast/itn",
      headers: {
        "user-agent": String(req.headers?.["user-agent"] || ""),
        "x-forwarded-for": String(req.headers?.["x-forwarded-for"] || ""),
      },
      body: payload,
      status_code: null,
      duration_ms: null,
    });

    const passphraseGate = assertPayfastPassphraseForItn();
    if (!passphraseGate.ok) {
      console.error("[payfast-itn]", passphraseGate.error);
      await updateItnLog(supabase, itnLogId, {
        verification_response: passphraseGate.error,
        verified: false,
      });
      return res.status(503).send("Server misconfigured");
    }

    // 3) Verify signature
    const passphrase = getPayfastMerchantCredentialsForMode(mode).passphrase;
    const signatureValid = checkPayfastItnSignature(payload, passphrase);
    await updateItnLog(supabase, itnLogId, { signature_valid: signatureValid });
    if (!signatureValid) {
      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        body: { step: "signature", ok: false },
        response: { error: "Invalid signature" },
        status_code: 400,
        duration_ms: Date.now() - started,
        error: "Invalid signature",
      });
      console.warn("[payfast-itn] Invalid signature", {
        m_payment_id: payload?.m_payment_id || null,
        pf_payment_id: payload?.pf_payment_id || null,
        mode,
      });
      return res.status(400).send("Invalid signature");
    }

    // 4) Verify source IP (recommended / enforced in live+prod unless skipped)
    if (shouldEnforcePayfastItnIp()) {
      const allowed = await resolvePayfastItnAllowedIps();
      if (!isPayfastItnIpAllowed(clientIp, allowed)) {
        await updateItnLog(supabase, itnLogId, {
          verification_response: `IP not allowed: ${clientIp || "(empty)"}`,
          verified: false,
        });
        await logWebhook(supabase, {
          path: "/api/payfast/itn",
          body: { step: "ip", ip: clientIp, ok: false },
          response: { error: "IP not allowed" },
          status_code: 403,
          duration_ms: Date.now() - started,
          error: "IP not allowed",
        });
        console.warn("[payfast-itn] IP not allowed", clientIp);
        return res.status(403).send("IP not allowed");
      }
    }

    // 5) POST back to PayFast (server-to-server VALID)
    const validate = await postBackPayfastValidate(payload, mode);
    await updateItnLog(supabase, itnLogId, {
      verification_response: validate.responseText,
    });
    if (!validate.ok) {
      await updateItnLog(supabase, itnLogId, { verified: false });
      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        body: { step: "validate", ok: false, response: validate.responseText },
        response: { error: "PayFast validate failed" },
        status_code: 400,
        duration_ms: Date.now() - started,
        error: "PayFast validate failed",
      });
      console.warn("[payfast-itn] PayFast validate failed", validate.responseText);
      return res.status(400).send("Invalid");
    }

    // 6) Merchant validation
    const merchant = checkPayfastMerchantId(payload, mode);
    await updateItnLog(supabase, itnLogId, { merchant_valid: merchant.ok });
    if (!merchant.ok) {
      await updateItnLog(supabase, itnLogId, { verified: false });
      console.warn("[payfast-itn]", merchant.error);
      return res.status(400).send("Merchant mismatch");
    }

    // Legacy customer invoice PayFast path — DISABLED (customer money goes through the Payment Engine).
    // SaaS subscription ITN continues below. Acknowledge so PayFast does not retry forever.
    const customStr1 = String(payload.custom_str1 || "");
    if (customStr1.startsWith("invoice:")) {
      console.warn(
        "[payfast-itn] Ignoring legacy customer invoice ITN — use the Payment Engine. custom_str1=",
        customStr1.slice(0, 48)
      );
      await updateItnLog(supabase, itnLogId, {
        verified: false,
        amount_valid: false,
        verification_response: `${validate.responseText}|invoice_customer_path_disabled`,
      });
      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        response: { ok: true, path: "invoice_disabled", settled: false },
        status_code: 200,
        duration_ms: Date.now() - started,
      });
      return res.status(200).send("OK");
    }

    // 8) Subscription validation (locate agreement)
    const sub = await loadSubscriptionForItn(supabase, payload);
    if (!sub?.id) {
      await updateItnLog(supabase, itnLogId, {
        amount_valid: false,
        verified: false,
        verification_response: `${validate.responseText}|subscription_not_found`,
      });
      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        body: { step: "subscription", ok: false },
        response: { error: "Subscription not found" },
        status_code: 400,
        duration_ms: Date.now() - started,
        error: "Subscription not found",
      });
      console.warn("[payfast-itn] subscription not found for ITN", payload.m_payment_id);
      return res.status(400).send("Subscription not found");
    }

    await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_RECEIVED, {
      itn_log_id: itnLogId,
      pf_payment_id: payload.pf_payment_id || null,
    });

    if (isSupersededAgreementItn(sub, payload)) {
      return handleSupersededAgreementItn(supabase, { sub, payload, itnLogId, validate, started, res });
    }

    // 7a) Agreement cancelled on PayFast (buyer, merchant dashboard, or our cancel API call).
    // Not a payment: no amount check, no failure count — just end the agreement here.
    const statusUpperEarly = String(payload.payment_status || "").toUpperCase();
    if (statusUpperEarly === "CANCELLED" || statusUpperEarly === "CANCELED") {
      await updateItnLog(supabase, itnLogId, { verified: true });
      if (sub.status !== SUBSCRIPTION_STATUS.CANCELLED) {
        const nowIso = new Date().toISOString();
        await supabase
          .from("subscriptions")
          .update({
            status: SUBSCRIPTION_STATUS.CANCELLED,
            cancelled_at: nowIso,
            canceled_at: nowIso,
            next_billing_date: null,
            next_retry_at: null,
            updated_at: nowIso,
          })
          .eq("id", sub.id);
        await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.CANCELLED, {
          source: "payfast_itn",
          previous_status: sub.status || null,
        });
      }
      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        response: { ok: true, cancelled: true, subscription_id: sub.id },
        status_code: 200,
        duration_ms: Date.now() - started,
      });
      return res.status(200).send("OK");
    }

    // 7) Amount + currency validation (against pending/catalog — never trust client)
    const expectedAmount = await resolveExpectedAmount(supabase, sub);
    const amountCheck = checkPayfastAmount(payload, expectedAmount);
    await updateItnLog(supabase, itnLogId, { amount_valid: amountCheck.ok });
    if (!amountCheck.ok) {
      await updateItnLog(supabase, itnLogId, { verified: false });
      await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_FAILED, {
        reason: "amount_mismatch",
        ...amountCheck,
      });
      console.warn("[payfast-itn]", amountCheck.error);
      return res.status(400).send("Amount mismatch");
    }

    const expectedCurrency = String(sub.currency || "ZAR").toUpperCase();
    const currencyCheck = checkPayfastCurrency(payload, expectedCurrency);
    if (!currencyCheck.ok) {
      await updateItnLog(supabase, itnLogId, { verified: false });
      await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_FAILED, {
        reason: "currency_mismatch",
        ...currencyCheck,
      });
      console.warn("[payfast-itn]", currencyCheck.error);
      return res.status(400).send("Currency mismatch");
    }

    // All hard checks passed
    await updateItnLog(supabase, itnLogId, { verified: true });
    await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_VERIFIED, {
      itn_log_id: itnLogId,
    });

    const pfPaymentId = sanitizeOneLine(String(payload.pf_payment_id || ""), 128);
    const paymentStatusUpper = String(payload.payment_status || "").toUpperCase();

    // 9) Prevent duplicate payment
    if (pfPaymentId) {
      const { data: existingPay } = await supabase
        .from("payment_history")
        .select("id")
        .eq("payfast_payment_id", pfPaymentId)
        .maybeSingle();
      if (existingPay?.id) {
        await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.PAYMENT_VERIFIED, {
          duplicate: true,
          payfast_payment_id: pfPaymentId,
          payment_history_id: existingPay.id,
        });
        await logWebhook(supabase, {
          path: "/api/payfast/itn",
          response: { ok: true, duplicate: true },
          status_code: 200,
          duration_ms: Date.now() - started,
        });
        return res.status(200).send("OK");
      }
    }

    try {
      // 10–12) Atomic apply when RPC available; else legacy three-step path
      const phStatus = mapPaymentHistoryStatus(paymentStatusUpper);
      const useAtomic =
        String(process.env.PAYFAST_ITN_ATOMIC_RPC || "true").toLowerCase() !== "false";

      let phRowId = null;
      let appliedDuplicate = false;

      // Downgrade queued via PATCH /subscriptions/{token}/update takes effect on the first
      // successful charge at the new amount.
      const scheduledChange =
        phStatus === PAYMENT_HISTORY_STATUS.COMPLETED ? await loadDueScheduledChange(supabase, sub) : null;
      const planHints = scheduledChange
        ? { planIdHint: scheduledChange.scheduled_plan_id || null, planSlugHint: scheduledChange.scheduled_plan_slug }
        : { planIdHint: sub.plan_id, planSlugHint: sub.plan_slug };

      if (useAtomic && phStatus === PAYMENT_HISTORY_STATUS.COMPLETED) {
        // Still run upsert for profile sync / token fields not covered by RPC alone
        await upsertSubscriptionFromItn(supabase, payload, {
          subscriptionIdHint: sub.id,
          companyIdHint: sub.company_id,
          ...planHints,
          userIdHint: sub.user_id,
        });

        const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_verified_payfast_payment", {
          p_subscription_id: sub.id,
          p_pf_payment_id: pfPaymentId || null,
          p_amount: amountCheck.gross,
          p_currency: String(payload.custom_str4 || sub.currency || "ZAR").toUpperCase(),
          p_payment_status: phStatus,
          p_raw: payload,
          // Same date the subscription row gets: the ledger records the period this charge paid for.
          p_period_end: nextBillingFromItn(payload),
          p_status: SUBSCRIPTION_STATUS.ACTIVE,
          p_payfast_token: sanitizeOneLine(String(payload.token || ""), 128) || null,
          p_payfast_subscription_id:
            sanitizeOneLine(String(payload.token || payload.pf_subscription_id || ""), 128) || null,
          p_company_id: sub.company_id || null,
          p_event_type: SUBSCRIPTION_EVENT_TYPE.PAYMENT_VERIFIED,
        });

        if (rpcErr) {
          console.warn("[payfast-itn] apply_verified_payfast_payment RPC failed; falling back", rpcErr.message);
        } else if (rpcData?.duplicate) {
          appliedDuplicate = true;
          phRowId = rpcData.payment_history_id || null;
        } else {
          phRowId = rpcData?.payment_history_id || null;
        }
      }

      if (!useAtomic || !phRowId && !appliedDuplicate) {
        await upsertSubscriptionFromItn(supabase, payload, {
          subscriptionIdHint: sub.id,
          companyIdHint: sub.company_id,
          ...planHints,
          userIdHint: sub.user_id,
        });

        const { data: phRow, error: phErr } = await insertPaymentHistory(supabase, {
          subscription_id: sub.id,
          company_id: sub.company_id,
          user_id: sub.user_id || null,
          plan_slug: sub.plan_slug || null,
          provider: "payfast",
          payment_type:
            sub.status === SUBSCRIPTION_STATUS.ACTIVE ||
            sub.status === SUBSCRIPTION_STATUS.PAST_DUE ||
            sub.status === SUBSCRIPTION_STATUS.SUSPENDED
              ? "renewal"
              : "initial",
          payfast_payment_id: pfPaymentId || null,
          amount: amountCheck.gross,
          currency: String(payload.custom_str4 || sub.currency || "ZAR").toUpperCase(),
          payment_status: phStatus,
          payment_method: sanitizeOneLine(String(payload.payment_method || "payfast"), 64) || "payfast",
          transaction_date: new Date().toISOString(),
          attempted_at: new Date().toISOString(),
          completed_at: phStatus === PAYMENT_HISTORY_STATUS.COMPLETED ? new Date().toISOString() : null,
          failure_reason:
            phStatus === PAYMENT_HISTORY_STATUS.FAILED
              ? sanitizeOneLine(String(payload.reason || payload.error || "PayFast could not collect this subscription payment"), 500)
              : null,
          billing_period_start: phStatus === PAYMENT_HISTORY_STATUS.COMPLETED ? new Date().toISOString() : null,
          billing_period_end: phStatus === PAYMENT_HISTORY_STATUS.COMPLETED ? nextBillingFromItn(payload) : null,
          raw_itn: payload,
          metadata: { m_payment_id: payload.m_payment_id || null },
        });

        if (phErr) {
          if (String(phErr.code) === "23505" || /duplicate/i.test(String(phErr.message || ""))) {
            console.warn("[payfast-itn] payment_history duplicate race", pfPaymentId);
            appliedDuplicate = true;
          } else {
            console.error("[payfast-itn] payment_history insert failed", phErr.message);
            throw new Error(phErr.message);
          }
        } else {
          phRowId = phRow?.id || null;
        }
      }

      if (appliedDuplicate) {
        await logWebhook(supabase, {
          path: "/api/payfast/itn",
          response: { ok: true, duplicate: true },
          status_code: 200,
          duration_ms: Date.now() - started,
        });
        return res.status(200).send("OK");
      }

      if (scheduledChange) {
        await supabase
          .from("subscriptions")
          .update({
            plan_family: familyForSlug(scheduledChange.scheduled_plan_slug) || null,
            scheduled_plan_slug: null,
            scheduled_plan_id: null,
            scheduled_change_at: null,
          })
          .eq("id", sub.id);
        await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.PLAN_CHANGED, {
          from: sub.plan_slug || null,
          to: scheduledChange.scheduled_plan_slug,
          source: "scheduled_downgrade",
          payfast_payment_id: pfPaymentId || null,
        });
      }

      if (phStatus === PAYMENT_HISTORY_STATUS.COMPLETED) {
        await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.PAYMENT_VERIFIED, {
          payment_history_id: phRowId,
          payfast_payment_id: pfPaymentId,
        });
        await cancelReplacedAgreement(supabase, sub, payload);
        if (sub.status === SUBSCRIPTION_STATUS.ACTIVE) {
          await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.RENEWED, {
            payfast_payment_id: pfPaymentId,
          });
        } else {
          await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.ACTIVATED, {
            payment_history_id: phRowId,
            payfast_payment_id: pfPaymentId,
            previous_status: sub.status || null,
          });
        }
      } else if (phStatus === PAYMENT_HISTORY_STATUS.FAILED) {
        await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.PAYMENT_FAILED, {
          payment_history_id: phRowId,
        });
        const firstFailure =
          sub.status !== SUBSCRIPTION_STATUS.PAST_DUE && sub.status !== SUBSCRIPTION_STATUS.SUSPENDED;
        if (firstFailure) {
          try {
            const { sendSubscriptionBillingEmail } = await import("./subscriptionBillingMail.js");
            const { BILLING_NOTIFY } = await import("../../../shared/subscriptionBillingPolicy.js");
            const { data: fresh } = await supabase
              .from("subscriptions")
              .select("id, user_id, company_id, email, user_email, full_name, user_name, grace_ends_at, status")
              .eq("id", sub.id)
              .maybeSingle();
            if (fresh?.grace_ends_at) {
              await sendSubscriptionBillingEmail(supabase, fresh, BILLING_NOTIFY.PAYMENT_FAILED);
            }
          } catch (mailErr) {
            console.warn("[payfast-itn] payment failed email", mailErr?.message || mailErr);
          }
        }
      }

      await logWebhook(supabase, {
        path: "/api/payfast/itn",
        response: { ok: true, subscription_id: sub.id, payment_history_id: phRowId || null },
        status_code: 200,
        duration_ms: Date.now() - started,
      });

      // 13) Return 200
      return res.status(200).send("OK");
    } catch (err) {
      console.error("[payfast-itn] processing error", err);
      await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_FAILED, {
        error: String(err?.message || err),
      });
      return res.status(500).send("Internal error");
    }
  };
}

/**
 * A new checkout paid on a row that held an older PayFast agreement: stop the old agreement at
 * PayFast so it can never charge again (it may only be locked after failed retries). Only when the
 * ITN matched the new checkout by m_payment_id and carries a different token. Best effort.
 */
async function cancelReplacedAgreement(supabase, sub, payload) {
  const oldToken = String(sub?.payfast_token || "").trim();
  const newToken = String(payload?.token || "").trim();
  if (sub?._matchedBy !== "m_payment_id" || !oldToken || !newToken || oldToken === newToken) return;
  let result;
  try {
    result = await cancelPayfastRecurringBilling(oldToken);
  } catch (err) {
    result = { ok: false, error: err?.message || String(err) };
  }
  await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.CANCELLED, {
    source: "replaced_payfast_agreement",
    payfast_cancel_ok: Boolean(result?.ok),
    payfast_cancel_error: result?.ok ? null : result?.error || null,
  });
  if (!result?.ok) {
    console.warn("[payfast-itn] could not cancel the replaced PayFast agreement", result?.error || result);
  }
}

/**
 * ITN for an agreement a newer checkout replaced. Acknowledged so PayFast stops resending; the
 * current subscription is untouched. A COMPLETE charge is still money received, so it is recorded
 * in the ledger for an admin to refund.
 */
async function handleSupersededAgreementItn(supabase, { sub, payload, itnLogId, validate, started, res }) {
  const statusUpper = String(payload.payment_status || "").toUpperCase();
  await updateItnLog(supabase, itnLogId, {
    verified: true,
    verification_response: `${validate.responseText}|superseded_agreement`,
  });
  if (statusUpper === "COMPLETE") {
    const pfPaymentId = sanitizeOneLine(String(payload.pf_payment_id || ""), 128) || null;
    const gross = Number(payload.amount_gross ?? payload.amount ?? 0);
    const { error } = await insertPaymentHistory(supabase, {
      subscription_id: sub.id,
      company_id: sub.company_id,
      user_id: sub.user_id || null,
      plan_slug: sub.plan_slug || null,
      provider: "payfast",
      payment_type: "superseded_agreement",
      payfast_payment_id: pfPaymentId,
      amount: Number.isFinite(gross) ? gross : null,
      currency: String(payload.custom_str4 || sub.currency || "ZAR").toUpperCase(),
      payment_status: PAYMENT_HISTORY_STATUS.COMPLETED,
      payment_method: "payfast",
      transaction_date: new Date().toISOString(),
      attempted_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      raw_itn: payload,
      metadata: { superseded_token: String(payload.token || ""), needs_admin_review: true },
    });
    if (error && !(String(error.code) === "23505" || /duplicate/i.test(String(error.message || "")))) {
      console.error("[payfast-itn] superseded payment record failed", error.message);
      return res.status(500).send("Internal error");
    }
  }
  await logSubEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_FAILED, {
    reason: "superseded_payfast_agreement",
    payment_status: statusUpper || null,
    pf_payment_id: payload.pf_payment_id || null,
  });
  console.warn("[payfast-itn] ITN for a replaced PayFast agreement; current subscription unchanged", {
    subscription_id: sub.id,
    payment_status: statusUpper,
  });
  await logWebhook(supabase, {
    path: "/api/payfast/itn",
    response: { ok: true, superseded: true, subscription_id: sub.id },
    status_code: 200,
    duration_ms: Date.now() - started,
  });
  return res.status(200).send("OK");
}
