import { getPayfastFrequency, getPayfastProcessUrl, signPayfastPayload } from "../../../server/src/payfast.js";
import { parseBody } from "../../../server/src/validateBody.js";
import { payfastSubscriptionBodySchema } from "../../../server/src/schemas/mutationSchemas.js";
import { assertFiniteAmount, isSafeHttpUrl, sanitizeOneLine } from "../../../server/src/inputValidation.js";
import { applyPaidlyServerlessCors } from "../../../server/src/vercelPaidlyCors.js";

const PAYFAST_BILLING_CYCLES = new Set(["monthly", "annual", "quarterly", "biannual"]);
const PAYFAST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function toPayfastBooleanFlag(value, fallback = true) {
  if (value == null) return fallback ? "true" : "false";
  if (typeof value === "boolean") return value ? "true" : "false";
  const v = String(value).trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes" || v === "on") return "true";
  if (v === "false" || v === "0" || v === "no" || v === "off") return "false";
  return fallback ? "true" : "false";
}

export default async function handler(req, res) {
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

  for (const u of [returnUrl, cancelUrl]) {
    if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
      return res.status(400).json({ error: "Invalid return or cancel URL" });
    }
  }

  const merchantId = process.env.PAYFAST_MERCHANT_ID || "";
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY || "";
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  if (!merchantId || !merchantKey) {
    return res.status(500).json({ error: "Payfast merchant credentials not configured" });
  }

  let defaultSubscriptionNotifyUrl = returnUrl;
  try {
    if (returnUrl) {
      const origin = new URL(String(returnUrl)).origin;
      defaultSubscriptionNotifyUrl = `${origin}/payfast/subscription/itn`;
    }
  } catch {
    /* noop */
  }
  const notifyUrl =
    process.env.PAYFAST_SUBSCRIPTION_NOTIFY_URL ||
    process.env.PAYFAST_NOTIFY_URL ||
    defaultSubscriptionNotifyUrl;
  const returnUrlResolved = process.env.PAYFAST_RETURN_URL || returnUrl;
  const cancelUrlResolved = process.env.PAYFAST_CANCEL_URL || cancelUrl;

  const now = new Date();
  const billingDateResolved =
    typeof billingDate === "string" && PAYFAST_DATE_RE.test(billingDate.trim())
      ? billingDate.trim()
      : now.toISOString().slice(0, 10);
  const frequency = getPayfastFrequency(cycleRaw);
  const planLabel = sanitizeOneLine(plan != null ? String(plan) : "Subscription", 120) || "Subscription";
  const userLabel = sanitizeOneLine(userName != null ? String(userName) : "", 200);
  const subIdSafe = String(subscriptionId).trim();
  const currencySafe = sanitizeOneLine(String(currency || "ZAR"), 8).toUpperCase();
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
    item_name: `${planLabel} Plan`,
    item_description: `Subscription for ${userLabel || userEmail}`,
    custom_str1: subIdSafe,
    custom_str2: userId ? String(userId).trim() : "",
    custom_str3: cycleRaw,
    custom_str4: currencySafe,
    email_address: userEmail,
    subscription_type: 2,
    billing_date: billingDateResolved,
    recurring_amount: amountCheck.value.toFixed(2),
    frequency,
    cycles: cyclesResolved,
    subscription_notify_email: toPayfastBooleanFlag(subscriptionNotifyEmail, true),
    subscription_notify_webhook: toPayfastBooleanFlag(subscriptionNotifyWebhook, true),
    subscription_notify_buyer: toPayfastBooleanFlag(subscriptionNotifyBuyer, true),
  };

  payload.signature = signPayfastPayload(payload, passphrase);
  return res.status(200).json({
    payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
    fields: payload,
  });
}
