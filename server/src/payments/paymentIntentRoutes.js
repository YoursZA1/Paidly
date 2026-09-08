import { requireOrgMember } from "../pos/posConnectionsRoutes.js";
import { requirePosCapability } from "../pos/posBusinessType.js";
import { requirePosPlan } from "../pos/posEntitlement.js";
import { roundMoney } from "../pos/posCheckoutMath.js";
import {
  mapPosPaymentMethodToProvider,
  normalizeCustomerPaymentProvider,
  publicPaymentIntentView,
  SAAS_BILLING_PROVIDER,
} from "./paymentIntentContract.js";
import { getCustomerPaymentProvider, listCustomerPaymentProviders } from "./paymentProviders.js";
import {
  applyVerifiedProviderEvent,
  assertPaymentEngineSource,
  createCustomerPaymentIntent,
  getOrgPaymentIntent,
  mapPaymentIntentSchemaError,
} from "./paymentEngine.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function schemaError(res, err) {
  return jsonError(res, 500, mapPaymentIntentSchemaError(err?.message));
}

/**
 * POST /api/payment-intents — create a customer payment intent (POS or document).
 * Does not charge; POS checkout confirms through the provider registry.
 */
export async function handlePaymentIntentCreate(req, res) {
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  let sourceKind;
  try {
    sourceKind = assertPaymentEngineSource(body.source_kind || "pos");
  } catch (err) {
    if (err?.code === "UNKNOWN_PAYMENT_ENGINE_SOURCE") {
      return jsonError(res, 422, err.message, { code: err.code });
    }
    throw err;
  }
  if (sourceKind === "pos") {
    const featureOk = await requirePosPlan(req, res);
    if (!featureOk) return;
    if (!(await requirePosCapability(res, gate.membership.orgId))) return;
  }

  const provider =
    normalizeCustomerPaymentProvider(body.provider) ||
    (sourceKind === "pos" ? mapPosPaymentMethodToProvider(body.payment_method) : null);
  if (!provider) {
    return jsonError(res, 422, "provider must be cash, ozow, or card_terminal (PayFast is not a customer rail)");
  }

  const amount = roundMoney(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return jsonError(res, 422, "amount is required");
  }

  try {
    const intent = await createCustomerPaymentIntent({
      orgId: gate.membership.orgId,
      sourceKind,
      provider,
      amount,
      currency: String(body.currency || "ZAR").trim().toUpperCase().slice(0, 3) || "ZAR",
      idempotencyKey: body.idempotency_key ? String(body.idempotency_key).trim() : null,
      clientId: body.client_id || null,
      companyId: body.company_id || null,
      createdBy: gate.user.id,
      documentId: body.document_id || null,
      documentType: body.document_type || null,
      metadata: { origin: "api", payment_method: body.payment_method || null },
    });
    return res.status(201).json({
      ok: true,
      payment_intent: publicPaymentIntentView(intent),
      providers: listCustomerPaymentProviders(),
    });
  } catch (err) {
    if (err?.code === "PAYFAST_NOT_CUSTOMER_RAIL") {
      return jsonError(res, 422, err.message, { code: err.code });
    }
    return schemaError(res, err);
  }
}

export async function handlePaymentIntentGet(req, res) {
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;
  const id = String(req.params?.id || req.query?.id || "").trim();
  if (!id) return jsonError(res, 422, "id is required");
  try {
    const intent = await getOrgPaymentIntent(gate.membership.orgId, id);
    if (!intent) return jsonError(res, 404, "Payment intent not found");
    return res.status(200).json({ ok: true, payment_intent: publicPaymentIntentView(intent) });
  } catch (err) {
    return schemaError(res, err);
  }
}

export async function handlePaymentProvidersList(req, res) {
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;
  return res.status(200).json({ ok: true, providers: listCustomerPaymentProviders() });
}

/**
 * POST /api/payments/webhook/:provider — customer rails only.
 * PayFast subscription ITN stays on /api/payfast-handler.
 */
export async function handleCustomerPaymentWebhook(req, res) {
  const providerId = String(req.params?.provider || "").trim().toLowerCase();
  if (!providerId) return jsonError(res, 404, "Not found");
  if (providerId === SAAS_BILLING_PROVIDER) {
    return jsonError(res, 400, "PayFast is only for Paidly platform subscriptions. Use /api/payfast-handler.", {
      code: "PAYFAST_NOT_CUSTOMER_RAIL",
    });
  }
  try {
    const provider = getCustomerPaymentProvider(providerId);
    if (typeof provider.handleWebhook !== "function") {
      return jsonError(res, 404, `No webhook handler for ${providerId}`);
    }
    const result = await provider.handleWebhook(req.body || {}, req);
    if (!result?.ok) {
      const status = result?.code === "PROVIDER_NOT_IMPLEMENTED" ? 501 : 400;
      return jsonError(res, status, result?.error || "Provider webhook failed", {
        code: result?.code || "PROVIDER_WEBHOOK_FAILED",
      });
    }
    if (!result.intentId || !result.nextStatus) {
      return res.status(200).json({ ok: true, ...result });
    }
    try {
      const applied = await applyVerifiedProviderEvent({
        intentId: result.intentId,
        nextStatus: result.nextStatus,
        externalId: result.externalId,
        amount: result.amount,
        metadata: {
          ozow_status: result.ozowStatus || null,
          webhook_verified: true,
        },
      });
      return res.status(200).json({
        ok: true,
        duplicate: Boolean(applied.duplicate),
        payment_intent: publicPaymentIntentView(applied.intent),
        settlement: applied.settlement
          ? {
              settled: applied.settlement.settled,
              duplicate: applied.settlement.duplicate,
              invoice_id: applied.settlement.invoice?.id || null,
              invoice_status: applied.settlement.invoice?.status || null,
              amount_due: applied.settlement.amountDue,
            }
          : null,
      });
    } catch (applyErr) {
      if (applyErr?.code === "INTENT_NOT_FOUND") {
        console.error("[payment-webhook] intent missing", result.intentId);
        return jsonError(res, 404, applyErr.message, { code: applyErr.code });
      }
      if (applyErr?.code === "AMOUNT_MISMATCH" || applyErr?.code === "INVALID_INTENT_TRANSITION") {
        console.error("[payment-webhook] rejected", applyErr.code, result.intentId);
        return jsonError(res, 409, applyErr.message, { code: applyErr.code });
      }
      throw applyErr;
    }
  } catch (err) {
    if (err?.code === "PAYFAST_NOT_CUSTOMER_RAIL" || err?.code === "UNKNOWN_PAYMENT_PROVIDER") {
      return jsonError(res, err.code === "UNKNOWN_PAYMENT_PROVIDER" ? 404 : 400, err.message, { code: err.code });
    }
    return jsonError(res, 500, err?.message || "Webhook failed");
  }
}
