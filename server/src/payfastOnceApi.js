/**
 * POST /api/payfast/once — one-time invoice payment (signed PayFast payload).
 * Shared by Express and Vercel serverless.
 */
import {
  assertPayfastHttpsUrlsInLive,
  assertPayfastPassphraseForLiveCheckout,
  getPayfastMerchantCredentialsFromEnv,
  getPayfastProcessUrl,
  logPayfastPayloadDebug,
  signPayfastPayload,
} from "./payfast.js";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { parseBody } from "./validateBody.js";
import { payfastOnceBodySchema } from "./schemas/mutationSchemas.js";
import { assertFiniteAmount, isSafeHttpUrl, sanitizeOneLine } from "./inputValidation.js";
import { sendUnexpectedError } from "./apiResponse.js";
import { applyPaidlyServerlessCors } from "./vercelPaidlyCors.js";

export default async function payfastOnceHandler(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const parsed = parseBody(payfastOnceBodySchema, req, res);
    if (!parsed) return;

    const {
      invoiceId: invId,
      amount,
      currency,
      clientName,
      clientEmail,
      returnUrl,
      cancelUrl
    } = parsed;

    const payerEmail = clientEmail;

    const amountOnceCheck = assertFiniteAmount(amount, { min: 0.01, max: 1_000_000_000 });
    if (!amountOnceCheck.ok) {
      return res.status(400).json({ error: amountOnceCheck.error });
    }

    for (const u of [returnUrl, cancelUrl]) {
      if (u != null && String(u).trim() !== "" && !isSafeHttpUrl(String(u))) {
        return res.status(400).json({ error: "Invalid return or cancel URL" });
      }
    }

    const { merchantId, merchantKey, passphrase } = getPayfastMerchantCredentialsFromEnv();
    let defaultOnceNotifyUrl = returnUrl;
    try {
      if (returnUrl) {
        const origin = new URL(String(returnUrl)).origin;
        defaultOnceNotifyUrl = `${origin}/api/payfast/webhook`;
      }
    } catch {
      /* keep returnUrl */
    }
    const notifyUrl =
      process.env.PAYFAST_ONCE_NOTIFY_URL ||
      process.env.PAYFAST_NOTIFY_URL ||
      defaultOnceNotifyUrl;
    const returnUrlResolved =
      process.env.PAYFAST_ONCE_RETURN_URL ||
      process.env.PAYFAST_RETURN_URL ||
      returnUrl;
    const cancelUrlResolved =
      process.env.PAYFAST_ONCE_CANCEL_URL ||
      process.env.PAYFAST_CANCEL_URL ||
      cancelUrl;

    if (notifyUrl == null || String(notifyUrl).trim() === "") {
      return res.status(400).json({
        code: "PAYFAST_NOTIFY_URL_MISSING",
        error:
          "Could not determine notify_url for invoice payment. Use an https returnUrl or set PAYFAST_ONCE_NOTIFY_URL / PAYFAST_NOTIFY_URL.",
      });
    }

    if (!merchantId || !merchantKey) {
      console.error("[payfast-once] Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY", {
        hasId: Boolean(merchantId),
        hasKey: Boolean(merchantKey),
        vercelEnv: process.env.VERCEL_ENV,
      });
      return res.status(422).json({
        code: "PAYFAST_MERCHANT_NOT_CONFIGURED",
        error:
          "PayFast merchant id/key missing: set PAYFAST_MERCHANT_ID and PAYFAST_MERCHANT_KEY (Vercel or .env).",
      });
    }

    const httpsOnce = assertPayfastHttpsUrlsInLive([
      ["return_url", returnUrlResolved],
      ["cancel_url", cancelUrlResolved],
      ["notify_url", notifyUrl],
    ]);
    if (!httpsOnce.ok) {
      return res.status(400).json({ error: httpsOnce.error });
    }

    const signingOnce = assertPayfastPassphraseForLiveCheckout();
    if (!signingOnce.ok) {
      return res.status(422).json({
        code: signingOnce.code || "PAYFAST_CHECKOUT_CONFIG",
        error: signingOnce.error,
      });
    }

    // Load invoice to validate amount and get org/client ids for ITN handling.
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, org_id, client_id, total_amount, invoice_number, currency")
      .eq("id", invId)
      .maybeSingle();

    if (invoiceError) {
      console.error("[payfast-once] Failed to load invoice", invoiceError.message);
      return res.status(500).json({ error: "Failed to load invoice" });
    }

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const invoiceAmount = Number(invoice.total_amount ?? amount);
    const paymentAmount = amountOnceCheck.value;
    const safeAmount = Number.isFinite(invoiceAmount)
      ? invoiceAmount
      : Number.isFinite(paymentAmount)
        ? paymentAmount
        : 0;

    if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
      return res.status(400).json({ error: "Invalid invoice amount" });
    }

    const nameLine = sanitizeOneLine(clientName != null ? String(clientName) : "", 200);
    const nameParts = nameLine.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ");

    const payload = {
      merchant_id: merchantId,
      merchant_key: merchantKey,
      return_url: returnUrlResolved,
      cancel_url: cancelUrlResolved,
      notify_url: notifyUrl,
      m_payment_id: `invoice-${invoice.id}-${Date.now()}`,
      amount: safeAmount.toFixed(2),
      item_name: `Invoice ${invoice.invoice_number || invoice.id}`,
      item_description: `Payment for invoice ${invoice.invoice_number || invoice.id}`,
      name_first: firstName || "",
      name_last: lastName || "",
      email_address: payerEmail,
      custom_str1: `invoice:${invoice.id}`,
      custom_str2: invoice.client_id || "",
      custom_str3: invoice.org_id || "",
      custom_str4: "once",
      custom_str5: invoice.currency || currency || "ZAR"
    };

    logPayfastPayloadDebug(payload);
    payload.signature = signPayfastPayload(payload, passphrase);
    if (!payload.signature) {
      return res.status(500).json({ error: "Failed to generate PayFast signature" });
    }

    return res.json({
      payfastUrl: getPayfastProcessUrl(process.env.PAYFAST_MODE || "sandbox"),
      fields: payload
    });
  } catch (err) {
    console.error("[payfast-once] Error", err);
    return sendUnexpectedError(res, err, "payfast-once");
  }
}
