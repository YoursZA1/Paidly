import {
  assertPayfastHttpsUrlsInLive,
  assertPayfastNotifyUrlReachable,
  assertPayfastPassphraseForSubscriptionCheckout,
  getPayfastFrequency,
  getPayfastMerchantCredentialsForMode,
  getPayfastProcessUrl,
  isPayfastKnownSandboxMerchantId,
  logPayfastPayloadDebug,
  payfastDeployedLikeProduction,
  payfastLiveMode,
  resolvePayfastSubscriptionNotifyUrl,
  signPayfastCheckoutFields,
} from "../payfast.js";
import { isSafeHttpUrl, sanitizeOneLine } from "../inputValidation.js";
import { getBillingSupabaseAdmin } from "./supabaseAdmin.js";
import { requireBearerUser, resolveUserCompanyId } from "./httpAuth.js";
import { loadActivePlan, listPublicPlans } from "./plansCatalog.js";
import { familyForSlug } from "../subscriptionPlans.js";
import { SUBSCRIPTION_STATUS } from "../../../shared/subscriptionStatuses.js";
import { SUBSCRIPTION_EVENT_TYPE } from "../../../shared/subscriptionEventTypes.js";
import { cancelPayfastRecurringBilling } from "./payfastRecurringApi.js";
import { hasPaidAccessIncludingGrace } from "./entitlements.js";
import { describePayfastCheckoutSignature } from "../payfastCustomSignature.js";
import { randomBytes } from "node:crypto";
import { assertCallerForAdminRoute } from "../adminRouteAccess.js";

const PENDING_TTL_MS = 2 * 60 * 60 * 1000;

function createSubscriptionMPaymentId(userId) {
  const unique = `${Date.now()}_${randomBytes(8).toString("hex")}`;
  return `sub_${userId}_${unique}`;
}

/** Split a display name into PayFast customer fields (Custom Integration order). */
export function splitPayfastBuyerName(fullName) {
  const nameParts = String(fullName || "")
    .split(/\s+/)
    .filter(Boolean);
  return {
    name_first: nameParts[0] || "",
    name_last: nameParts.slice(1).join(" ") || "",
  };
}

/**
 * Unsigned PayFast checkout fields for subscription create and diagnose.
 * Customer name fields are part of the Custom Integration canonical attribute order.
 */
export function buildSubscriptionCheckoutUnsignedPayload({
  merchantId,
  merchantKey,
  returnUrl,
  cancelUrl,
  notifyUrl,
  email,
  fullName,
  mPaymentId,
  userId,
  plan,
  billingDate,
}) {
  const cycleRaw = String(plan.billing_cycle || "monthly").toLowerCase();
  const amountFixed = Number(plan.amount).toFixed(2);
  const { name_first, name_last } = splitPayfastBuyerName(fullName);
  return {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: returnUrl,
    cancel_url: cancelUrl,
    notify_url: notifyUrl,
    name_first,
    name_last,
    email_address: email,
    m_payment_id: mPaymentId,
    amount: amountFixed,
    item_name: sanitizeOneLine(plan.payfast_item_name || plan.name, 100),
    item_description: sanitizeOneLine(
      plan.description || `Paidly ${plan.name} subscription`,
      255
    ),
    custom_str1: userId,
    custom_str2: plan.slug,
    custom_str3: cycleRaw,
    custom_str4: plan.currency || "ZAR",
    subscription_type: 1,
    billing_date: billingDate,
    recurring_amount: amountFixed,
    frequency: getPayfastFrequency(cycleRaw),
    cycles: 0,
    subscription_notify_email: toPayfastBooleanFlag(true, true),
    subscription_notify_webhook: toPayfastBooleanFlag(true, true),
    subscription_notify_buyer: toPayfastBooleanFlag(true, true),
  };
}

function json(res, status, body) {
  return res.status(status).json(body);
}

function toPayfastBooleanFlag(value, fallback = true) {
  if (value == null) return fallback ? "true" : "false";
  if (typeof value === "boolean") return value ? "true" : "false";
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return "true";
  if (v === "false" || v === "0" || v === "no" || v === "off") return "false";
  return fallback ? "true" : "false";
}

async function logEvent(supabase, subscriptionId, companyId, eventType, details = {}) {
  try {
    await supabase.from("subscription_events").insert({
      subscription_id: subscriptionId,
      company_id: companyId,
      event_type: eventType,
      source: "api",
      details,
    });
  } catch (e) {
    console.warn("[billing/subscriptions] subscription_events insert failed", e?.message || e);
  }
}

/**
 * POST /api/subscriptions/create
 *
 * Security: never trust frontend for payment state; credentials/signing stay server-side;
 * status stays pending until verified PayFast ITN (see docs/SUBSCRIPTION_BILLING_SCHEMA.md).
 *
 * Does:
 *   1. Authenticate user (Bearer)
 *   2. Validate selected plan from `plans` (server amount — ignore client price)
 *   3. Create pending subscription + save DB record
 *   4. Generate PayFast signature (server-only passphrase)
 *   5. Return redirect URL (+ form fields) + timeline Redirected
 *
 * Never:
 *   - Activate subscription (status stays pending)
 *   - Store payment success / payment_history / invoices
 *   - Trust frontend amount, status, tokens, or “paid” flags
 *   - Expose merchant_key / passphrase / verification helpers to the client
 *
 * Body (trusted keys only): { planSlug, returnUrl, cancelUrl, notifyUrl? }
 */
export async function handleSubscriptionCreate(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  // 1) Authenticate
  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });
  const user = auth.user;

  const body = req.body && typeof req.body === "object" ? req.body : {};

  // Never trust frontend billing claims — reject if client tries to drive them
  const untrustedKeys = [
    "amount",
    "price",
    "status",
    "activated",
    "activate",
    "paid",
    "payment_status",
    "payfast_token",
    "payfast_payment_id",
    "signature",
    "merchant_id",
    "merchant_key",
  ];
  for (const key of untrustedKeys) {
    if (body[key] != null && String(body[key]).trim() !== "") {
      return json(res, 400, {
        error: `Do not send "${key}" — checkout never trusts the frontend for pricing or activation`,
        code: "UNTRUSTED_CHECKOUT_FIELD",
      });
    }
  }

  // 2) Validate plan (catalog SoR)
  const planSlug = String(body.planSlug || body.plan || body.slug || "").trim();
  const plan = await loadActivePlan(supabase, planSlug);
  if (!plan) {
    return json(res, 400, { error: "Invalid or inactive plan" });
  }
  if (plan.contact_sales) {
    return json(res, 400, {
      error: "Enterprise plans require contacting sales — not available for self-serve checkout",
      code: "CONTACT_SALES",
    });
  }
  if (!Number.isFinite(plan.amount) || plan.amount <= 0) {
    return json(res, 400, { error: "Invalid or inactive plan" });
  }
  if (plan.source !== "db") {
    const requireDb =
      String(process.env.VERCEL || "").trim() !== "" ||
      String(process.env.NODE_ENV || "").toLowerCase() === "production";
    if (requireDb) {
      return json(res, 503, {
        code: "PLANS_CATALOG_UNAVAILABLE",
        error: "Plan catalog unavailable. Apply billing migration so public.plans is seeded.",
      });
    }
    console.warn("[billing/subscriptions/create] using shared plan fallback (dev only)", plan.slug);
  }

  const returnUrl = body.returnUrl != null ? String(body.returnUrl).trim() : "";
  const cancelUrl = body.cancelUrl != null ? String(body.cancelUrl).trim() : "";
  const notifyUrlBody =
    body.notifyUrl != null && String(body.notifyUrl).trim() !== ""
      ? String(body.notifyUrl).trim()
      : null;

  if (!returnUrl || !cancelUrl) {
    return json(res, 400, { error: "returnUrl and cancelUrl are required" });
  }
  for (const u of [returnUrl, cancelUrl, notifyUrlBody]) {
    if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
      return json(res, 400, { error: "Invalid return, cancel, or notify URL" });
    }
  }

  const companyId = await resolveUserCompanyId(supabase, user.id);
  if (!companyId) {
    return json(res, 400, { error: "No company context for user" });
  }

  const mode = String(process.env.PAYFAST_MODE || "sandbox").trim().toLowerCase();
  const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsForMode(mode);
  if (!merchantId || !merchantKey) {
    return json(res, 422, {
      code: "PAYFAST_MERCHANT_NOT_CONFIGURED",
      error: "PayFast merchant credentials are not configured",
    });
  }
  if (mode === "live" && isPayfastKnownSandboxMerchantId(merchantId)) {
    return json(res, 422, {
      code: "PAYFAST_LIVE_SANDBOX_CREDENTIALS",
      error: "Live mode is using sandbox merchant credentials",
    });
  }

  const notifyResolved = resolvePayfastSubscriptionNotifyUrl({
    clientNotifyUrl: notifyUrlBody,
    returnUrl,
  });
  if (!notifyResolved.ok) {
    return json(res, 400, {
      code: notifyResolved.code || "PAYFAST_NOTIFY_URL_MISSING",
      error: notifyResolved.error,
    });
  }
  const notifyUrl = notifyResolved.notifyUrl;
  const notifyReachable = assertPayfastNotifyUrlReachable(notifyUrl);
  if (!notifyReachable.ok) {
    return json(res, 422, {
      code: notifyReachable.code || "PAYFAST_NOTIFY_URL_NOT_PUBLIC",
      error: notifyReachable.error,
    });
  }

  const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
  const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;
  const httpsCheckout = assertPayfastHttpsUrlsInLive([
    ["return_url", returnUrlResolved],
    ["cancel_url", cancelUrlResolved],
    ["notify_url", notifyUrl],
  ]);
  if (!httpsCheckout.ok) return json(res, 400, { error: httpsCheckout.error });

  const signingReady = assertPayfastPassphraseForSubscriptionCheckout();
  if (!signingReady.ok) {
    return json(res, 422, {
      code: signingReady.code || "PAYFAST_CHECKOUT_CONFIG",
      error: signingReady.error,
    });
  }
  if (!passphrase) {
    return json(res, 422, {
      code: "PAYFAST_PASSPHRASE_REQUIRED",
      error: "PAYFAST_PASSPHRASE is empty after loading merchant credentials.",
    });
  }

  const mPaymentId = createSubscriptionMPaymentId(user.id);
  const now = new Date();
  const nowIso = now.toISOString();
  const pendingExpiresAt = new Date(now.getTime() + PENDING_TTL_MS).toISOString();
  const email = String(user.email || "").trim();
  if (!email) {
    return json(res, 400, {
      code: "PAYFAST_EMAIL_REQUIRED",
      error: "A verified account email is required to start PayFast checkout.",
    });
  }
  const fullName = sanitizeOneLine(
    String(user.user_metadata?.full_name || user.user_metadata?.name || ""),
    200
  );

  // Supersede prior pending only (never touch active agreements here)
  await supabase
    .from("subscriptions")
    .update({ status: SUBSCRIPTION_STATUS.CANCELLED, updated_at: nowIso })
    .eq("user_id", user.id)
    .eq("status", SUBSCRIPTION_STATUS.PENDING);

  // 3) Create pending subscription — save DB record (no payment success, no activation)
  const insertRow = {
    email: email || `${user.id}@users.paidly.local`,
    full_name: fullName || null,
    user_email: email || null,
    user_name: fullName || null,
    user_id: user.id,
    created_by: user.id,
    company_id: companyId,
    plan_id: plan.id,
    plan_slug: plan.slug,
    plan: plan.slug,
    current_plan: plan.slug,
    plan_family: plan.plan_family || familyForSlug(plan.slug),
    amount: plan.amount,
    currency: plan.currency,
    billing_cycle: plan.billing_cycle,
    status: SUBSCRIPTION_STATUS.PENDING,
    m_payment_id: mPaymentId,
    pending_expires_at: pendingExpiresAt,
    provider: "payfast",
    activated_at: null,
    payfast_payment_id: null,
    payfast_token: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: sub, error: insertErr } = await supabase
    .from("subscriptions")
    .insert(insertRow)
    .select("id, status, plan_slug, amount, currency, m_payment_id, pending_expires_at, company_id")
    .single();

  if (insertErr || !sub) {
    console.error("[billing/subscriptions/create] insert failed", insertErr);
    return json(res, 500, { error: "Failed to create pending subscription" });
  }

  if (sub.status !== SUBSCRIPTION_STATUS.PENDING) {
    console.error("[billing/subscriptions/create] refused non-pending status after insert", sub.status);
    return json(res, 500, { error: "Subscription create aborted: unexpected status" });
  }

  // Intentionally no payment_history / subscription_invoices writes on create.

  await logEvent(supabase, sub.id, companyId, SUBSCRIPTION_EVENT_TYPE.SUBSCRIPTION_CREATED, {
    plan_slug: plan.slug,
    amount: plan.amount,
  });
  await logEvent(supabase, sub.id, companyId, SUBSCRIPTION_EVENT_TYPE.PAYMENT_PENDING, {
    m_payment_id: mPaymentId,
  });

  // 4) Generate PayFast signature (server amount, document field order, PHP encoding)
  const billingDateResolved = nowIso.slice(0, 10);
  const amountFixed = Number(plan.amount).toFixed(2);
  const unsignedPayload = buildSubscriptionCheckoutUnsignedPayload({
    merchantId,
    merchantKey,
    returnUrl: returnUrlResolved,
    cancelUrl: cancelUrlResolved,
    notifyUrl,
    email,
    fullName,
    mPaymentId,
    userId: user.id,
    plan,
    billingDate: billingDateResolved,
  });

  const signed = signPayfastCheckoutFields(unsignedPayload, passphrase);
  if (!signed.signature) {
    return json(res, 500, { error: "Failed to generate PayFast signature" });
  }

  logPayfastPayloadDebug(signed.fields, passphrase);
  console.log("[payfast] subscription checkout", {
    subscriptionId: sub.id,
    m_payment_id: mPaymentId,
    amount: amountFixed,
    mode,
    notify_source: notifyResolved.source,
  });

  const redirectUrl = getPayfastProcessUrl(mode);

  // Timeline: Redirected — checkout URL ready for browser → PayFast
  await logEvent(supabase, sub.id, companyId, SUBSCRIPTION_EVENT_TYPE.REDIRECTED, {
    m_payment_id: mPaymentId,
    redirect_url: redirectUrl,
  });

  // 5) Return redirect URL — frontend posts `fields` in `fieldOrder`; must poll status afterward
  return json(res, 200, {
    subscriptionId: sub.id,
    status: SUBSCRIPTION_STATUS.PENDING,
    redirectUrl,
    payfastUrl: redirectUrl,
    fields: signed.fields,
    fieldOrder: signed.fieldOrder,
    plan: {
      slug: plan.slug,
      name: plan.name,
      amount: plan.amount,
      currency: plan.currency,
    },
    accessGranted: false,
    message:
      "Pending subscription created. Redirect to PayFast. Do not activate from the client — poll GET /api/subscriptions/status.",
  });
}

/**
 * Shape for GET /api/subscriptions/status — poll after PayFast; never activate from client.
 * Returns: Current Plan, Current Status, Expiry, Renew Date.
 */
async function buildSubscriptionStatusPayload(supabase, sub) {
  let planName = null;
  let planSlug = sub.plan_slug || sub.plan || sub.current_plan || null;
  if (sub.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("slug, name")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (plan) {
      planSlug = plan.slug || planSlug;
      planName = plan.name || null;
    }
  }
  if (!planName && planSlug) {
    const { data: plan } = await supabase
      .from("plans")
      .select("name")
      .eq("slug", planSlug)
      .maybeSingle();
    planName = plan?.name || planSlug;
  }

  const currentStatus = sub.status || null;
  /** Access end: expires_at → current_period_end → pending_expires_at */
  const expiry =
    sub.expires_at || sub.current_period_end || sub.pending_expires_at || null;
  /** Next charge / renewal */
  const renewDate = sub.next_billing_date || null;

  return {
    subscriptionId: sub.id,
    /** Current Plan */
    currentPlan: planSlug,
    currentPlanName: planName,
    /** Current Status */
    currentStatus,
    /** Expiry */
    expiry,
    /** Renew Date */
    renewDate,
    // camelCase aliases for clients
    plan: planSlug,
    status: currentStatus,
    expiresAt: expiry,
    renewAt: renewDate,
    nextBillingDate: renewDate,
    planFamily: sub.plan_family || familyForSlug(planSlug) || null,
    graceEndsAt: sub.grace_ends_at || null,
    accessGranted: hasPaidAccessIncludingGrace(sub),
  };
}

/**
 * GET /api/subscriptions/status?subscriptionId=
 * Omitting subscriptionId returns the company's latest agreement (same as current).
 */
export async function handleSubscriptionStatus(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const q = req.query || {};
  let subscriptionId = String(q.subscriptionId || q.id || "").trim();
  const companyId = await resolveUserCompanyId(supabase, auth.user.id);

  let sub = null;
  if (subscriptionId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select(
        "id, status, plan, current_plan, plan_slug, plan_id, plan_family, amount, currency, company_id, user_id, created_by, m_payment_id, activated_at, pending_expires_at, next_billing_date, current_period_end, expires_at, cancelled_at, grace_ends_at, created_at, updated_at"
      )
      .eq("id", subscriptionId)
      .maybeSingle();
    if (error) {
      console.error("[billing/subscriptions/status]", error);
      return json(res, 500, { error: "Failed to load subscription" });
    }
    sub = data;
  } else {
    let query = supabase
      .from("subscriptions")
      .select(
        "id, status, plan, current_plan, plan_slug, plan_id, plan_family, amount, currency, company_id, user_id, created_by, m_payment_id, activated_at, pending_expires_at, next_billing_date, current_period_end, expires_at, cancelled_at, grace_ends_at, created_at, updated_at"
      )
      .order("updated_at", { ascending: false })
      .limit(1);
    query = companyId ? query.eq("company_id", companyId) : query.eq("user_id", auth.user.id);
    const { data: rows, error } = await query;
    if (error) {
      console.error("[billing/subscriptions/status]", error);
      return json(res, 500, { error: "Failed to load subscription" });
    }
    sub = rows?.[0] || null;
  }

  if (!sub) return json(res, 404, { error: "Subscription not found" });

  const owns =
    sub.user_id === auth.user.id ||
    sub.created_by === auth.user.id ||
    (companyId && sub.company_id === companyId);
  if (!owns) return json(res, 403, { error: "Forbidden" });

  const payload = await buildSubscriptionStatusPayload(supabase, sub);
  return json(res, 200, payload);
}

export async function handleSubscriptionCurrent(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const companyId = await resolveUserCompanyId(supabase, auth.user.id);

  let query = supabase
    .from("subscriptions")
    .select(
      "id, status, plan_slug, plan_id, plan_family, amount, currency, company_id, activated_at, next_billing_date, current_period_end, cancelled_at, grace_ends_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .limit(1);

  if (companyId) {
    query = query.eq("company_id", companyId);
  } else {
    query = query.eq("user_id", auth.user.id);
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error("[billing/subscriptions/current]", error);
    return json(res, 500, { error: "Failed to load subscription" });
  }

  const sub = rows?.[0] || null;
  if (!sub) {
    return json(res, 200, {
      subscription: null,
      currentPlan: null,
      currentStatus: null,
      expiry: null,
      renewDate: null,
      accessGranted: false,
    });
  }

  const statusPayload = await buildSubscriptionStatusPayload(supabase, sub);
  return json(res, 200, {
    subscription: sub,
    ...statusPayload,
  });
}

/**
 * POST /api/subscriptions/cancel
 *
 * 1. Authenticate
 * 2. Verify ownership
 * 3. Cancel PayFast recurring billing (token API) when a token exists
 * 4. Update DB → cancelled
 * 5. Insert subscription_events.cancelled
 *
 * Body: { subscriptionId? }
 */
export async function handleSubscriptionCancel(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  // 1) Authenticate
  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  let subscriptionId = String(body.subscriptionId || body.id || "").trim();
  const companyId = await resolveUserCompanyId(supabase, auth.user.id);

  if (!subscriptionId) {
    let q = supabase
      .from("subscriptions")
      .select("id")
      .in("status", [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.PAST_DUE,
        SUBSCRIPTION_STATUS.TRIALING,
        SUBSCRIPTION_STATUS.PENDING,
        SUBSCRIPTION_STATUS.PROCESSING,
        SUBSCRIPTION_STATUS.SUSPENDED,
      ])
      .order("updated_at", { ascending: false })
      .limit(1);
    q = companyId ? q.eq("company_id", companyId) : q.eq("user_id", auth.user.id);
    const { data: rows } = await q;
    subscriptionId = rows?.[0]?.id || "";
  }

  if (!subscriptionId) {
    return json(res, 404, { error: "No cancellable subscription found" });
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, user_id, created_by, company_id, status, payfast_token, payfast_subscription_id, m_payment_id"
    )
    .eq("id", subscriptionId)
    .maybeSingle();

  if (!sub) return json(res, 404, { error: "Subscription not found" });

  // 2) Verify ownership
  const owns =
    sub.user_id === auth.user.id ||
    sub.created_by === auth.user.id ||
    (companyId && sub.company_id === companyId);
  if (!owns) return json(res, 403, { error: "Forbidden" });

  if (sub.status === SUBSCRIPTION_STATUS.CANCELLED) {
    return json(res, 200, {
      subscription: {
        id: sub.id,
        status: sub.status,
        cancelled_at: null,
      },
      payfast: { skipped: true, reason: "already_cancelled" },
      message: "Subscription already cancelled",
    });
  }

  // 3) Cancel PayFast recurring billing (when token exists)
  const pfToken = String(sub.payfast_token || sub.payfast_subscription_id || "").trim();
  let payfastResult = { ok: true, skipped: true, reason: "no_token" };
  if (pfToken) {
    payfastResult = await cancelPayfastRecurringBilling(pfToken);
    if (!payfastResult.ok) {
      const allowDbOnly =
        String(process.env.PAYFAST_CANCEL_ALLOW_DB_ONLY || "").toLowerCase() === "true";
      if (!allowDbOnly) {
        await logEvent(supabase, subscriptionId, sub.company_id, SUBSCRIPTION_EVENT_TYPE.WEBHOOK_FAILED, {
          action: "cancel",
          error: payfastResult.error || "PayFast cancel failed",
          httpStatus: payfastResult.status || null,
        });
        return json(res, 502, {
          error: payfastResult.error || "Failed to cancel PayFast recurring billing",
          code: "PAYFAST_CANCEL_FAILED",
          payfast: payfastResult,
        });
      }
      console.warn(
        "[billing/subscriptions/cancel] PayFast cancel failed; continuing with DB cancel (PAYFAST_CANCEL_ALLOW_DB_ONLY)",
        payfastResult.error
      );
    }
  }

  // 4) Update DB
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("subscriptions")
    .update({
      status: SUBSCRIPTION_STATUS.CANCELLED,
      cancelled_at: nowIso,
      canceled_at: nowIso,
      next_billing_date: null,
      next_retry_at: null,
      updated_at: nowIso,
    })
    .eq("id", subscriptionId)
    .select("id, status, cancelled_at, plan_slug, company_id")
    .single();

  if (error) {
    console.error("[billing/subscriptions/cancel]", error);
    return json(res, 500, { error: "Failed to cancel subscription" });
  }

  // 5) Insert event
  await logEvent(supabase, subscriptionId, sub.company_id, SUBSCRIPTION_EVENT_TYPE.CANCELLED, {
    by: auth.user.id,
    payfast: {
      skipped: Boolean(payfastResult.skipped),
      ok: Boolean(payfastResult.ok),
      status: payfastResult.status || null,
      reason: payfastResult.reason || null,
    },
  });

  return json(res, 200, {
    subscription: updated,
    currentStatus: SUBSCRIPTION_STATUS.CANCELLED,
    payfast: {
      cancelled: !payfastResult.skipped && payfastResult.ok,
      skipped: Boolean(payfastResult.skipped),
      reason: payfastResult.reason || null,
    },
    message: "Subscription cancelled",
  });
}

/**
 * GET /api/subscriptions/plans — public catalog (no auth).
 */
export async function handleSubscriptionPlans(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  const includeInactive =
    String(req.query?.includeInactive || "").trim() === "1" ||
    String(req.query?.includeInactive || "").toLowerCase() === "true";

  const plans = await listPublicPlans(supabase, { includeInactive });
  if (!plans.length) {
    // Dev fallback: shared catalog only when DB empty
    const { PUBLIC_PLAN_SLUGS, getPlanBySlug } = await import("../subscriptionPlans.js");
    const fallback = PUBLIC_PLAN_SLUGS.map((slug) => {
      const p = getPlanBySlug(slug);
      if (!p) return null;
      return {
        id: null,
        slug,
        name: p.name,
        description: "",
        billing_cycle: p.billing_cycle || "monthly",
        amount: p.price,
        currency: "ZAR",
        features: p.features,
        plan_family: p.family,
        contact_sales: Boolean(p.contact_sales),
        source: "shared_fallback",
      };
    }).filter(Boolean);
    return json(res, 200, { plans: fallback });
  }

  return json(res, 200, {
    plans: plans.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      billing_cycle: p.billing_cycle,
      amount: p.amount,
      currency: p.currency,
      features: p.features,
      plan_family: p.plan_family,
      tier_rank: p.tier_rank,
      interval_months: p.interval_months,
      limits: p.limits,
      contact_sales: p.contact_sales,
      sort_order: p.sort_order,
    })),
  });
}

/**
 * POST /api/subscriptions/change — cancel current token then create pending checkout for new plan.
 * Body: { planSlug, returnUrl, cancelUrl, subscriptionId? }
 */
export async function handleSubscriptionChange(req, res) {
  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const companyId = await resolveUserCompanyId(supabase, auth.user.id);

  let subscriptionId = String(body.subscriptionId || body.id || "").trim();
  if (!subscriptionId) {
    let q = supabase
      .from("subscriptions")
      .select("id, status, payfast_token, payfast_subscription_id, company_id, user_id, created_by, plan_slug")
      .in("status", [
        SUBSCRIPTION_STATUS.ACTIVE,
        SUBSCRIPTION_STATUS.PAST_DUE,
        SUBSCRIPTION_STATUS.TRIALING,
        SUBSCRIPTION_STATUS.SUSPENDED,
      ])
      .order("updated_at", { ascending: false })
      .limit(1);
    q = companyId ? q.eq("company_id", companyId) : q.eq("user_id", auth.user.id);
    const { data: rows } = await q;
    subscriptionId = rows?.[0]?.id || "";
  }

  if (subscriptionId) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select(
        "id, user_id, created_by, company_id, status, payfast_token, payfast_subscription_id, plan_slug"
      )
      .eq("id", subscriptionId)
      .maybeSingle();

    if (sub) {
      const owns =
        sub.user_id === auth.user.id ||
        sub.created_by === auth.user.id ||
        (companyId && sub.company_id === companyId);
      if (!owns) return json(res, 403, { error: "Forbidden" });

      const pfToken = String(sub.payfast_token || sub.payfast_subscription_id || "").trim();
      if (pfToken && sub.status !== SUBSCRIPTION_STATUS.CANCELLED) {
        const payfastResult = await cancelPayfastRecurringBilling(pfToken);
        if (!payfastResult.ok) {
          const allowDbOnly =
            String(process.env.PAYFAST_CANCEL_ALLOW_DB_ONLY || "").toLowerCase() === "true";
          if (!allowDbOnly) {
            return json(res, 502, {
              error: payfastResult.error || "Failed to cancel existing PayFast billing before change",
              code: "PAYFAST_CANCEL_FAILED",
            });
          }
        }
        const nowIso = new Date().toISOString();
        await supabase
          .from("subscriptions")
          .update({
            status: SUBSCRIPTION_STATUS.CANCELLED,
            cancelled_at: nowIso,
            canceled_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", sub.id);
        await logEvent(supabase, sub.id, sub.company_id, SUBSCRIPTION_EVENT_TYPE.CANCELLED, {
          reason: "plan_change",
          previous_plan: sub.plan_slug,
          next_plan: body.planSlug || null,
          by: auth.user.id,
        });
      }
    }
  }

  // Reuse create flow for new pending checkout
  return handleSubscriptionCreate(req, res);
}

function payfastDiagnosticAllowed() {
  const forced = String(process.env.PAYFAST_DIAGNOSTIC || "").trim().toLowerCase();
  if (forced === "true" || forced === "1" || forced === "yes") return true;
  if (forced === "false" || forced === "0" || forced === "no") return false;
  if (payfastLiveMode() || payfastDeployedLikeProduction()) return false;
  return true;
}

/**
 * POST /api/subscriptions/payfast-diagnose
 * Admin + sandbox/dev only. Rebuilds a checkout signature for a plan without creating a subscription.
 * Never returns passphrase or merchant_key.
 */
export async function handlePayfastDiagnose(req, res) {
  if (!payfastDiagnosticAllowed()) {
    return json(res, 404, { error: "Not found" });
  }

  const supabase = getBillingSupabaseAdmin();
  if (!supabase) return json(res, 503, { error: "Server configuration error (Supabase)" });

  const auth = await requireBearerUser(req, supabase);
  if (auth.error) return json(res, auth.status, { error: auth.error });
  const denied = await assertCallerForAdminRoute(supabase, auth.user);
  if (denied) return json(res, denied.status, denied.body);

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const planSlug = String(body.planSlug || body.plan || "").trim();
  const plan = await loadActivePlan(supabase, planSlug);
  if (!plan || !Number.isFinite(plan.amount) || plan.amount <= 0) {
    return json(res, 400, { error: "Invalid or inactive plan" });
  }

  const mode = String(process.env.PAYFAST_MODE || "sandbox").trim().toLowerCase();
  const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsForMode(mode);
  const notifyResolved = resolvePayfastSubscriptionNotifyUrl({
    clientNotifyUrl: body.notifyUrl,
    returnUrl: body.returnUrl,
  });

  const fullName = sanitizeOneLine(
    String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || ""),
    200
  );
  const unsignedPayload = buildSubscriptionCheckoutUnsignedPayload({
    merchantId: merchantId || "MISSING",
    merchantKey: merchantKey || "MISSING",
    returnUrl: String(body.returnUrl || "https://example.invalid/success"),
    cancelUrl: String(body.cancelUrl || "https://example.invalid/cancel"),
    notifyUrl: notifyResolved.notifyUrl || "https://example.invalid/api/payfast/itn",
    email: auth.user.email || "buyer@example.invalid",
    fullName,
    mPaymentId: "sub_diagnostic_preview",
    userId: auth.user.id,
    plan,
    billingDate: new Date().toISOString().slice(0, 10),
  });

  const diag = describePayfastCheckoutSignature(unsignedPayload, passphrase);
  return json(res, 200, {
    environment: mode,
    processUrl: getPayfastProcessUrl(mode),
    passphraseConfigured: Boolean(passphrase),
    merchantIdConfigured: Boolean(merchantId),
    merchantKeyConfigured: Boolean(merchantKey),
    notifyUrl: notifyResolved.notifyUrl || null,
    notifySource: notifyResolved.source || null,
    includedFields: diag.includedFields,
    encodedPairs: diag.encodedPairs,
    paramStringRedacted: diag.paramStringRedacted,
    signature: diag.signature,
    passphraseAppended: diag.passphraseAppended,
    validation: {
      passphrase: Boolean(passphrase),
      merchant: Boolean(merchantId && merchantKey),
      notify: notifyResolved.ok,
      amount: Number(plan.amount) > 0,
    },
  });
}
