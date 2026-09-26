import { CUSTOMER_PAYMENT_PROVIDERS } from "../paymentIntentContract.js";
import {
  buildOzowPaymentRequest,
  hashesMatch,
  normalizeOzowWebhookBody,
  ozowAmountString,
  ozowCredentials,
  ozowRedirectUrl,
  verifyOzowNotifyHash,
} from "../ozowHash.js";
import { mapOzowStatusToIntentStatus } from "../../../../shared/payments/paymentIntentStates.js";
import { resolvePublicAppOrigin } from "../../companyInviteAppUrl.js";

/**
 * Ozow adapter — one online (instant EFT) provider behind the Payment Engine.
 * Serves the POS digital tender and invoice Pay Now when it is the configured online provider.
 * Charge never marks paid. Paid is only applied after a verified Notify/ITN.
 * Credentials are server-side env (OZOW_SITE_CODE / OZOW_API_KEY / OZOW_PRIVATE_KEY).
 */
export function ozowCredentialsPresent(env = process.env) {
  const creds = ozowCredentials(env);
  return Boolean(creds.siteCode && creds.apiKey && creds.privateKey);
}

function defaultAppOrigin(chargeCtx = {}) {
  if (chargeCtx.appOrigin) return String(chargeCtx.appOrigin).replace(/\/$/, "");
  return resolvePublicAppOrigin().replace(/\/$/, "");
}

function defaultNotifyUrl(chargeCtx = {}) {
  if (chargeCtx.notifyUrl) return String(chargeCtx.notifyUrl);
  const origin = defaultAppOrigin(chargeCtx);
  return `${origin}/api/payment-intents/webhook/ozow`;
}

function defaultReturnUrls(intent, chargeCtx = {}) {
  const origin = defaultAppOrigin(chargeCtx);
  if (intent.source_kind === "pos") {
    const till = `${origin}/pos?payment=return&intent=${encodeURIComponent(intent.id)}`;
    return {
      successUrl: chargeCtx.successUrl || till,
      cancelUrl: chargeCtx.cancelUrl || `${till}&result=cancel`,
      errorUrl: chargeCtx.errorUrl || `${till}&result=error`,
      notifyUrl: defaultNotifyUrl(chargeCtx),
    };
  }
  const token = chargeCtx.shareToken ? `&token=${encodeURIComponent(chargeCtx.shareToken)}` : "";
  const invoiceId = intent.document_id || "";
  const staff = `${origin}/ViewDocument/invoice/${encodeURIComponent(invoiceId)}?pay=return&intent=${encodeURIComponent(intent.id)}`;
  const publicView = chargeCtx.shareToken
    ? `${origin}/view/${encodeURIComponent(chargeCtx.shareToken)}?pay=return&intent=${encodeURIComponent(intent.id)}`
    : staff;
  const base = chargeCtx.successUrl || publicView;
  return {
    successUrl: base,
    cancelUrl: chargeCtx.cancelUrl || `${base}${token ? "" : ""}&result=cancel`.replace("&&", "&"),
    errorUrl: chargeCtx.errorUrl || `${base}&result=error`,
    notifyUrl: defaultNotifyUrl(chargeCtx),
  };
}

export const ozowProvider = {
  id: CUSTOMER_PAYMENT_PROVIDERS.OZOW,
  kind: "online",
  sourceKinds: ["pos", "document"],
  /** Ozow settles in South African rand only. */
  currencies: ["ZAR"],
  isConfigured() {
    return ozowCredentialsPresent();
  },
  async createCharge(intent, chargeCtx = {}) {
    if (!ozowCredentialsPresent()) {
      return {
        status: "failed",
        code: "PROVIDER_NOT_CONFIGURED",
        error: "Ozow is not configured on this deployment. The payment was not started.",
      };
    }
    const urls = defaultReturnUrls(intent, chargeCtx);
    const fields = buildOzowPaymentRequest(intent, urls);
    const redirectUrl = ozowRedirectUrl(fields);
    return {
      status: "requires_action",
      code: "OZOW_REDIRECT",
      next_action: {
        type: "redirect",
        redirect_url: redirectUrl,
      },
      external_id: intent.external_id || null,
      ozow: {
        site_code: fields.SiteCode,
        transaction_reference: fields.TransactionReference,
        is_test: fields.IsTest,
      },
    };
  },
  /**
   * Verify Ozow Notify/ITN. Does not persist. Routes apply the status machine.
   * Success URL hits are not this handler.
   */
  async handleWebhook(body) {
    if (!ozowCredentialsPresent()) {
      return {
        ok: false,
        code: "PROVIDER_NOT_CONFIGURED",
        error: "Ozow merchant credentials are not configured.",
      };
    }
    const fields = normalizeOzowWebhookBody(body);
    const creds = ozowCredentials();
    if (!verifyOzowNotifyHash(fields, creds.privateKey)) {
      console.error("[ozow-webhook] hash mismatch", {
        transactionReference: fields.TransactionReference,
        status: fields.Status,
      });
      return {
        ok: false,
        code: "OZOW_HASH_INVALID",
        error: "Ozow notification hash could not be verified.",
      };
    }
    if (fields.SiteCode && !hashesMatch(fields.SiteCode, creds.siteCode)) {
      return {
        ok: false,
        code: "OZOW_SITE_MISMATCH",
        error: "Ozow SiteCode does not match this merchant.",
      };
    }
    const nextStatus = mapOzowStatusToIntentStatus(fields.Status);
    if (!nextStatus) {
      console.error("[ozow-webhook] unknown status", fields.Status);
      return {
        ok: false,
        code: "OZOW_STATUS_UNKNOWN",
        error: `Unsupported Ozow status: ${fields.Status || "(empty)"}`,
      };
    }
    return {
      ok: true,
      provider: CUSTOMER_PAYMENT_PROVIDERS.OZOW,
      intentId: String(fields.TransactionReference || "").trim(),
      nextStatus,
      externalId: String(fields.TransactionId || "").trim() || null,
      amount: ozowAmountString(fields.Amount),
      providerStatus: fields.Status,
      verified: true,
    };
  },
};
