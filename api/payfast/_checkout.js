import {
  assertPayfastClientNotifySameOrigin,
  assertPayfastHttpsUrlsInLive,
  assertPayfastPassphraseForLiveCheckout,
  getPayfastFrequency,
  getPayfastMerchantCredentialsFromEnv,
  getPayfastProcessUrl,
  logPayfastPayloadDebug,
  signPayfastPayload,
} from "../../server/src/payfast.js";
import { parseBody } from "../../server/src/validateBody.js";
import { payfastSubscriptionBodySchema } from "../../server/src/schemas/mutationSchemas.js";
import { assertFiniteAmount, isSafeHttpUrl, sanitizeOneLine } from "../../server/src/inputValidation.js";
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";

/**
 * PayFast subscription checkout — imported by `api/payfast-handler.js` (Vercel rewrite).
 * Underscore prefix: not a standalone Vercel function (Hobby function-count limit).
 */

const PAYFAST_BILLING_CYCLES = new Set(["monthly", "annual", "quarterly", "biannual"]);
const PAYFAST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function payfastSubscriptionSmokeTestEnabled() {
  const v = String(process.env.PAYFAST_SUBSCRIPTION_SMOKE_TEST || "").trim().toLowerCase();
  return v === "true" || v === "1";
}

function toPayfastBooleanFlag(value, fallback = true) {
  if (value == null) return fallback ? "true" : "false";
  if (typeof value === "boolean") return value ? "true" : "false";
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return "true";
  if (v === "false" || v === "0" || v === "no" || v === "off") return "false";
  return fallback ? "true" : "false";
}

export default async function payfastSubscriptionCheckout(req, res) {
  try {
    if (payfastSubscriptionSmokeTestEnabled()) {
      applyPaidlyServerlessCors(req, res, { methods: "GET, POST, OPTIONS" });
      if (req.method === "OPTIONS") return res.status(200).end();
      return res.status(200).json({
        success: true,
        message: "API working",
      });
    }

    if (process.env.VERCEL && process.env.PAYFAST_MODE && process.env.PAYFAST_MODE !== "live") {
      console.warn(
        "[payfast/subscription] PAYFAST_MODE is not 'live' — checkout uses the sandbox PayFast host. Set PAYFAST_MODE=live for real charges."
      );
    }
    applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
    if (req.method === "OPTIONS") return res.status(200).end();
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const parsed = parseBody(payfastSubscriptionBodySchema, req, res);
    if (!parsed) return;

    const {
      subscriptionId,
      userId,
      userEmail,
      userName,
      plan,
      billingCycle,
      amount,
      currency,
      returnUrl,
      cancelUrl,
      notifyUrl: notifyUrlBody,
      itemDescription,
      billingDate,
      cycles,
      subscriptionNotifyEmail,
      subscriptionNotifyWebhook,
      subscriptionNotifyBuyer,
    } = parsed;

    const amountCheck = assertFiniteAmount(amount, { min: 0.01, max: 1_000_000_000 });
    if (!amountCheck.ok) return res.status(400).json({ error: amountCheck.error });

    const cycleRaw = String(billingCycle || "monthly").toLowerCase();
    if (!PAYFAST_BILLING_CYCLES.has(cycleRaw)) {
      return res.status(400).json({ error: "Invalid billing cycle" });
    }

    const currencySafe = sanitizeOneLine(String(currency || "ZAR"), 8).toUpperCase();
    if (!/^[A-Z0-9]{3,8}$/.test(currencySafe)) {
      return res.status(400).json({ error: "Invalid currency" });
    }

    for (const u of [returnUrl, cancelUrl, notifyUrlBody]) {
      if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
        return res.status(400).json({ error: "Invalid return, cancel, or notify URL" });
      }
    }

    const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsFromEnv();
    if (!merchantId || !merchantKey) {
      console.error("[payfast/subscription] Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY", {
        hasId: Boolean(merchantId),
        hasKey: Boolean(merchantKey),
        vercelEnv: process.env.VERCEL_ENV,
      });
      return res.status(422).json({
        code: "PAYFAST_MERCHANT_NOT_CONFIGURED",
        error:
          "Set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY in Vercel → Environment Variables (Production), or in repo-root .env / server/.env for local dev.",
      });
    }

    let defaultSubscriptionNotifyUrl = returnUrl;
    try {
      if (returnUrl) {
        const origin = new URL(String(returnUrl)).origin;
        defaultSubscriptionNotifyUrl = `${origin}/api/payfast/webhook`;
      }
    } catch {
      /* noop */
    }
    const notifyUrl =
      (notifyUrlBody != null && String(notifyUrlBody).trim() !== ""
        ? String(notifyUrlBody).trim()
        : null) ||
      process.env.PAYFAST_SUBSCRIPTION_NOTIFY_URL ||
      process.env.PAYFAST_NOTIFY_URL ||
      defaultSubscriptionNotifyUrl;
    const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
    const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;

    if (notifyUrl == null || String(notifyUrl).trim() === "") {
      return res.status(400).json({
        code: "PAYFAST_NOTIFY_URL_MISSING",
        error:
          "Could not determine notify_url. Use https returnUrl/cancelUrl or set PAYFAST_SUBSCRIPTION_NOTIFY_URL on Vercel.",
      });
    }

    const clientSuppliedNotify =
      notifyUrlBody != null && String(notifyUrlBody).trim() !== "";
    if (clientSuppliedNotify && (!returnUrl || String(returnUrl).trim() === "")) {
      return res.status(400).json({ error: "return_url is required when supplying notify_url" });
    }
    if (clientSuppliedNotify) {
      const notifyOrigin = assertPayfastClientNotifySameOrigin(notifyUrl, returnUrl);
      if (!notifyOrigin.ok) {
        return res.status(400).json({ error: notifyOrigin.error });
      }
    }

    const httpsCheckout = assertPayfastHttpsUrlsInLive([
      ["return_url", returnUrlResolved],
      ["cancel_url", cancelUrlResolved],
      ["notify_url", notifyUrl],
    ]);
    if (!httpsCheckout.ok) {
      return res.status(400).json({ error: httpsCheckout.error });
    }

    const signingReady = assertPayfastPassphraseForLiveCheckout();
    if (!signingReady.ok) {
      return res.status(422).json({
        code: signingReady.code || "PAYFAST_CHECKOUT_CONFIG",
        error: signingReady.error,
      });
    }

    const now = new Date();
    const billingDateResolved =
      typeof billingDate === "string" && PAYFAST_DATE_RE.test(billingDate.trim())
        ? billingDate.trim()
        : now.toISOString().slice(0, 10);
    const frequency = getPayfastFrequency(cycleRaw);
    const planLabel = sanitizeOneLine(plan != null ? String(plan) : "Paidly", 120) || "Paidly";
    const userLabel = sanitizeOneLine(userName != null ? String(userName) : "", 200);
    const descFromClient = sanitizeOneLine(itemDescription != null ? String(itemDescription) : "", 255);
    const itemDesc =
      descFromClient ||
      `Subscription for ${userLabel || userEmail}`;
    const subIdSafe = String(subscriptionId).trim();
    const cyclesNumber = Number(cycles);
    const cyclesResolved =
      Number.isFinite(cyclesNumber) && cyclesNumber >= 0 ? Math.floor(cyclesNumber) : 0;

    const payload = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrlResolved,
      cancel_url: cancelUrlResolved,
      notify_url: notifyUrl,
      m_payment_id: `${subIdSafe}-${Date.now()}`,
      amount: amountCheck.value.toFixed(2),
      item_name: planLabel,
      item_description: itemDesc,
      custom_str1: subIdSafe,
      custom_str2: userId ? String(userId).trim() : "",
      custom_str3: cycleRaw,
      custom_str4: currencySafe,
      email_address: userEmail,
      subscription_type: 1,
      billing_date: billingDateResolved,
      recurring_amount: amountCheck.value.toFixed(2),
      frequency,
      cycles: cyclesResolved,
      subscription_notify_email: toPayfastBooleanFlag(subscriptionNotifyEmail, true),
      subscription_notify_webhook: toPayfastBooleanFlag(subscriptionNotifyWebhook, true),
      subscription_notify_buyer: toPayfastBooleanFlag(subscriptionNotifyBuyer, true),
    };

    logPayfastPayloadDebug(payload);

    payload.signature = signPayfastPayload(payload, passphrase);
    if (!payload.signature) {
      return res.status(500).json({
        code: "PAYFAST_SIGNATURE_FAILED",
        error: "Failed to generate PayFast signature",
      });
    }
    return res.status(200).json({
      payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
      fields: payload,
    });
  } catch (e) {
    console.error("[payfast/subscription]", e);
    return res.status(500).json({
      code: "PAYFAST_SUBSCRIPTION_HANDLER_ERROR",
      error: e?.message || "Internal error",
    });
  }
}
