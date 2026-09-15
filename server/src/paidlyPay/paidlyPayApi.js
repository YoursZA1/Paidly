import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeRequestBody } from "../validateBody.js";
import { isValidUuid } from "../inputValidation.js";
import { roundMoney } from "../pos/posCheckoutMath.js";
import { applyVerifiedProviderEvent, getOrgPaymentIntent } from "../payments/paymentEngine.js";
import { applyVerifiedIntentStatus } from "../payments/paymentIntentService.js";
import {
  ACTIVE_PAYMENT_INTENT_STATUSES,
  PAYMENT_INTENT_STATUS,
  isConfirmedPaymentIntent,
} from "../../../shared/payments/paymentIntentStates.js";
import {
  PAIDLY_PAY_ERROR,
  PAIDLY_PAY_SERVICE,
  PAIDLY_PAY_VERSION,
  isKnownPaidlyPayWebhookEvent,
  isMockPaymentsEnabled,
  isOpenIntentStatus,
  intentStatusFromWebhookEvent,
  mockOutcomeToIntentStatus,
  mockOutcomeToWebhookEvent,
  normalizePaidlyPayMethod,
  paidlyPayEnvironment,
  paidlyPayOpenUrl,
  paymentReferenceForIntent,
  providerForPaidlyPayMethod,
  publicStatusFromIntent,
  resolvePaidlyPayOrigin,
  tillMethodForPaidlyPayMethod,
  transactionReferenceForIntent,
} from "../../../shared/payments/paidlyPayContract.js";
import {
  applyPaidlyPayCors,
  captureRawBody,
  enforcePaidlyPayRateLimit,
  logPaidlyRequest,
  newPaidlyRequestId,
  paidlyEndpointFromParts,
  parseJsonObject,
  sendPaidlyError,
  sendPaidlyJson,
} from "./paidlyPayHttp.js";
import {
  requirePaidlyPayAuth,
  resolveOwnedCompanyId,
  webhookSecretsToTry,
} from "./paidlyPayAuth.js";
import { readPosSignature, verifyPaidlyPaySignature } from "./paidlyPayHmac.js";

const OPEN_STATUSES = [...ACTIVE_PAYMENT_INTENT_STATUSES];

function parsePaidlyParts(req) {
  if (Array.isArray(req.paidlyParts) && req.paidlyParts.length) {
    return req.paidlyParts.map((part) => String(part).trim()).filter(Boolean);
  }
  const rewritten = req.query?.__paidly;
  if (rewritten) {
    const text = Array.isArray(rewritten) ? rewritten.join("/") : String(rewritten);
    return text.split("/").filter(Boolean);
  }
  const urlPath = String(req.url || req.path || "").split("?")[0] || "";
  const paidly = urlPath.replace(/^\/api\/(pos\/)?paidly\/?/i, "");
  return paidly ? paidly.split("/").filter(Boolean) : [];
}

function firstQuery(req, key) {
  const raw = req.query?.[key];
  if (Array.isArray(raw)) return String(raw[0] || "").trim();
  return raw == null ? "" : String(raw).trim();
}

function decodeCursor(raw) {
  if (!raw) return null;
  try {
    const text = Buffer.from(String(raw), "base64url").toString("utf8");
    const [createdAt, id] = text.split("|");
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row) {
  if (!row?.created_at || !row?.id) return null;
  return Buffer.from(`${row.created_at}|${row.id}`, "utf8").toString("base64url");
}

function checkoutMeta(intent) {
  const metadata = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  return metadata.checkout && typeof metadata.checkout === "object" ? metadata.checkout : {};
}

function publicTransaction(intent, sale = null) {
  const checkout = checkoutMeta(intent);
  const status = publicStatusFromIntent(intent, sale);
  return {
    id: intent.id,
    reference: sale?.receipt_number || transactionReferenceForIntent(intent),
    company_id: intent.company_id || checkout.company_id || null,
    amount: roundMoney(intent.amount),
    currency: intent.currency || "ZAR",
    status: status === "succeeded" ? "paid" : status === "created" || status === "pending" || status === "processing" ? "open" : status,
    payment_status: status,
    customer_name: checkout.customer_name || "Walk-in Customer",
    created_at: intent.created_at,
  };
}

function withOpenUrl(nextAction, intent, req, method) {
  const action = nextAction && typeof nextAction === "object" ? { ...nextAction } : {};
  if (!intent?.id) return action;
  action.payment_intent_id = intent.id;
  if (!action.open_url) {
    const origin = resolvePaidlyPayOrigin(process.env, req);
    action.open_url = paidlyPayOpenUrl(intent.id, {
      origin,
      method: method === "qr" || action.type === "qr" ? "qr" : "tap_to_pay",
    });
  }
  if ((method === "qr" || action.type === "qr") && !action.qr_payload) {
    action.qr_payload = action.open_url;
  }
  return action;
}

function publicPaymentIntent(intent, sale = null, req = null) {
  const metadata = intent?.metadata && typeof intent.metadata === "object" ? intent.metadata : {};
  const checkout = checkoutMeta(intent);
  return {
    payment_intent_id: intent.id,
    pos_transaction_id: intent.id,
    company_id: intent.company_id || checkout.company_id || null,
    amount: roundMoney(intent.amount),
    currency: intent.currency || "ZAR",
    status: publicStatusFromIntent(intent, sale),
    payment_method: metadata.paidly_pay_method || metadata.payment_method || null,
    reference: paymentReferenceForIntent(intent),
    created_at: intent.created_at || null,
    updated_at: intent.updated_at || null,
    next_action: withOpenUrl(metadata.next_action, intent, req, metadata.paidly_pay_method),
  };
}

function companyFilter(query, auth, requestedCompanyId) {
  const companyId = resolveOwnedCompanyId(auth, requestedCompanyId);
  if (companyId) return query.eq("company_id", companyId);
  return query;
}

async function loadOwnedIntent(auth, intentId) {
  if (!isValidUuid(intentId)) return null;
  const intent = await getOrgPaymentIntent(auth.orgId, intentId);
  if (!intent || intent.source_kind !== "pos") return null;
  if (auth.companyId && intent.company_id && String(intent.company_id) !== String(auth.companyId)) {
    const error = new Error("This API key cannot access another company");
    error.code = PAIDLY_PAY_ERROR.CROSS_COMPANY_DENIED;
    error.status = 403;
    throw error;
  }
  return intent;
}

async function loadSaleForIntent(intent) {
  if (!intent?.pos_sale_event_id) return null;
  const { data } = await supabaseAdmin
    .from("pos_sales_events")
    .select("id, receipt_number, refund_status, refunded_amount, status, org_id, company_id")
    .eq("id", intent.pos_sale_event_id)
    .eq("org_id", intent.org_id)
    .maybeSingle();
  return data || null;
}

async function loadActiveDevice(auth, deviceId) {
  if (!deviceId || !isValidUuid(deviceId)) return null;
  const { data, error } = await supabaseAdmin
    .from("paidly_devices")
    .select("*")
    .eq("id", deviceId)
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (error) {
    if (/paidly_devices|schema cache|does not exist/i.test(error.message || "")) return null;
    throw error;
  }
  if (data && auth.companyId && data.company_id && String(data.company_id) !== String(auth.companyId)) {
    return null;
  }
  return data || null;
}

async function findProviderEvent(orgId, providerEventId) {
  if (!providerEventId) return null;
  const { data, error } = await supabaseAdmin
    .from("payment_provider_events")
    .select("id")
    .eq("org_id", orgId)
    .eq("provider_event_id", providerEventId)
    .maybeSingle();
  if (error) {
    if (/payment_provider_events|schema cache|does not exist/i.test(error.message || "")) return null;
    throw error;
  }
  return data || null;
}

async function rememberProviderEvent({ orgId, providerEventId, eventType, paymentIntentId, payload }) {
  if (!providerEventId) return { duplicate: false };
  const { data, error } = await supabaseAdmin
    .from("payment_provider_events")
    .insert({
      org_id: orgId,
      provider_event_id: providerEventId,
      event_type: eventType,
      payment_intent_id: paymentIntentId || null,
      payload: payload && typeof payload === "object" ? payload : {},
    })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { duplicate: true };
    if (/payment_provider_events|schema cache|does not exist/i.test(error.message || "")) {
      return { duplicate: false, skipped: true };
    }
    throw error;
  }
  return { duplicate: false, id: data?.id || null };
}

async function handleHealth(req, res, requestId) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "health", req, requestId))) return;
  return sendPaidlyJson(
    res,
    200,
    {
      ok: true,
      service: PAIDLY_PAY_SERVICE,
      environment: paidlyPayEnvironment(),
      version: PAIDLY_PAY_VERSION,
    },
    requestId
  );
}

async function handleListTransactions(req, res, requestId, auth) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "transactions", req, requestId))) return;

  const status = firstQuery(req, "status") || "open";
  const limit = Math.min(Math.max(Number(firstQuery(req, "limit") || 50) || 50, 1), 100);
  let query = supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("org_id", auth.orgId)
    .eq("source_kind", "pos")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  try {
    query = companyFilter(query, auth, firstQuery(req, "company_id"));
  } catch (err) {
    return sendPaidlyError(res, err.status || 403, err.code, err.message, requestId);
  }

  if (status === "open") {
    query = query.in("status", OPEN_STATUSES).is("pos_sale_event_id", null);
  }

  const cursor = decodeCursor(firstQuery(req, "cursor"));
  if (cursor) {
    query = query.lt("created_at", cursor.createdAt);
  }

  const { data, error } = await query;
  if (error) throw error;
  const rows = data || [];
  const page = rows.slice(0, limit);
  const next = rows.length > limit ? encodeCursor(page[page.length - 1]) : null;
  return sendPaidlyJson(
    res,
    200,
    {
      transactions: page.map((row) => publicTransaction(row)),
      next_cursor: next,
    },
    requestId
  );
}

async function handleGetTransaction(req, res, requestId, auth, id) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "transactions", req, requestId))) return;
  const intent = await loadOwnedIntent(auth, id);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found", requestId);
  }
  const sale = await loadSaleForIntent(intent);
  return sendPaidlyJson(res, 200, publicTransaction(intent, sale), requestId);
}

async function handleCreatePaymentIntent(req, res, requestId, auth) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "payments_create", req, requestId))) return;

  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body.amount != null || body.status != null) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.AMOUNT_OVERRIDE_FORBIDDEN,
      "Amount and status are taken from the POS transaction. The client cannot override them.",
      requestId
    );
  }

  const transactionId = String(body.pos_transaction_id || "").trim();
  const method = normalizePaidlyPayMethod(body.payment_method);
  if (!method) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.INVALID_PAYMENT_METHOD,
      "payment_method must be tap_to_pay, qr, card, cash, eft, or payment_link",
      requestId
    );
  }

  const deviceId = String(req.headers?.["x-device-id"] || body.device_id || "").trim();
  if (deviceId) {
    const device = await loadActiveDevice(auth, deviceId);
    if (!device || device.status === "revoked") {
      return sendPaidlyError(
        res,
        403,
        PAIDLY_PAY_ERROR.DEVICE_REVOKED,
        "This device cannot create payment intents",
        requestId
      );
    }
  }

  const intent = await loadOwnedIntent(auth, transactionId);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found", requestId);
  }
  if (isConfirmedPaymentIntent(intent.status) || intent.pos_sale_event_id) {
    return sendPaidlyError(
      res,
      409,
      PAIDLY_PAY_ERROR.PAYMENT_TRANSACTION_ALREADY_PAID,
      "This transaction has already been paid.",
      requestId
    );
  }
  if (!isOpenIntentStatus(intent.status)) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.PAYMENT_NOT_PAYABLE,
      "This transaction is not payable.",
      requestId
    );
  }

  const provider = providerForPaidlyPayMethod(method);
  const nextAction =
    provider === "card_terminal"
      ? withOpenUrl(
          {
            type: method === "qr" ? "qr" : "tap_to_pay",
            display: method === "qr" ? "QR PAY" : "TAP CARD",
            mock: isMockPaymentsEnabled(),
          },
          intent,
          req,
          method
        )
      : withOpenUrl(intent.metadata?.next_action || null, intent, req, method);

  const metadata = {
    ...(intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {}),
    paidly_pay_method: method,
    payment_method: tillMethodForPaidlyPayMethod(method),
    payment_reference: paymentReferenceForIntent(intent),
    next_action: nextAction,
    device_id: deviceId || null,
    mock: isMockPaymentsEnabled(),
  };

  const { data: updated, error } = await supabaseAdmin
    .from("payment_intents")
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("org_id", auth.orgId)
    .select("*")
    .single();
  if (error) throw error;

  return sendPaidlyJson(res, 200, publicPaymentIntent(updated, null, req), requestId);
}

async function handleGetPaymentIntent(req, res, requestId, auth, id) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "payments_read", req, requestId))) return;
  const intent = await loadOwnedIntent(auth, id);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "Payment intent not found", requestId);
  }
  const sale = await loadSaleForIntent(intent);
  return sendPaidlyJson(res, 200, publicPaymentIntent(intent, sale, req), requestId);
}

async function handleCancelPaymentIntent(req, res, requestId, auth, id) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "payments_mutate", req, requestId))) return;
  const intent = await loadOwnedIntent(auth, id);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "Payment intent not found", requestId);
  }
  if (isConfirmedPaymentIntent(intent.status) || intent.status === "refunded") {
    return sendPaidlyError(
      res,
      409,
      PAIDLY_PAY_ERROR.PAYMENT_NOT_CANCELLABLE,
      "Settled payments cannot be cancelled from the terminal.",
      requestId
    );
  }
  const applied = await applyVerifiedIntentStatus(intent, PAYMENT_INTENT_STATUS.cancelled, {
    source: "paidly_pay_cancel",
  });
  return sendPaidlyJson(res, 200, publicPaymentIntent(applied.intent, null, req), requestId);
}

async function handleSimulatePaymentIntent(req, res, requestId, auth, id) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!isMockPaymentsEnabled()) {
    return sendPaidlyError(
      res,
      403,
      PAIDLY_PAY_ERROR.MOCK_NOT_ENABLED,
      "Mock payments are not enabled on this environment.",
      requestId
    );
  }
  if (!(await enforcePaidlyPayRateLimit(res, "payments_mutate", req, requestId))) return;
  const intent = await loadOwnedIntent(auth, id);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "Payment intent not found", requestId);
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (body.amount != null || body.status != null) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.AMOUNT_OVERRIDE_FORBIDDEN,
      "Amount and status are taken from the payment intent. The client cannot override them.",
      requestId
    );
  }
  const nextStatus = mockOutcomeToIntentStatus(body.outcome);
  if (!nextStatus) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.INVALID_MOCK_OUTCOME,
      "outcome must be succeeded, failed, cancelled, processing, or expired",
      requestId
    );
  }
  const eventType = mockOutcomeToWebhookEvent(body.outcome) || `payment.${nextStatus}`;
  const eventKey = `mock:${intent.id}:${nextStatus}`;
  const existingEvent = await findProviderEvent(intent.org_id, eventKey);
  if (existingEvent) {
    return sendPaidlyJson(
      res,
      200,
      { ok: true, duplicate: true, payment_intent: publicPaymentIntent(intent, null, req) },
      requestId
    );
  }
  const applied = await applyVerifiedProviderEvent({
    intentId: intent.id,
    nextStatus,
    externalId: eventKey,
    metadata: {
      mock: true,
      webhook_verified: true,
      terminal_confirmed: nextStatus === PAYMENT_INTENT_STATUS.paid,
      paidly_pay_event: eventType,
      source: "paidly_pay_simulate",
    },
  });
  await rememberProviderEvent({
    orgId: intent.org_id,
    providerEventId: eventKey,
    eventType,
    paymentIntentId: intent.id,
    payload: { event: eventType, payment_intent_id: intent.id, mock: true },
  });
  return sendPaidlyJson(
    res,
    200,
    {
      ok: true,
      duplicate: Boolean(applied.duplicate),
      payment_intent: publicPaymentIntent(applied.intent, null, req),
      settlement: applied.settlement
        ? {
            settled: applied.settlement.settled,
            duplicate: applied.settlement.duplicate,
            sale_id: applied.settlement.saleId || null,
          }
        : null,
    },
    requestId
  );
}

async function handleRefundPaymentIntent(req, res, requestId, auth, id) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "payments_mutate", req, requestId))) return;
  const intent = await loadOwnedIntent(auth, id);
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "Payment intent not found", requestId);
  }
  if (!isConfirmedPaymentIntent(intent.status)) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.PAYMENT_NOT_REFUNDABLE,
      "Only a successful payment can be refunded.",
      requestId
    );
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requested = roundMoney(body.amount);
  const refundable = roundMoney(intent.amount);
  if (!Number.isFinite(requested) || requested <= 0 || requested > refundable) {
    return sendPaidlyError(
      res,
      422,
      PAIDLY_PAY_ERROR.REFUND_AMOUNT_INVALID,
      "Refund amount must be greater than zero and not exceed the paid amount.",
      requestId
    );
  }

  const { data: refund, error } = await supabaseAdmin
    .from("payment_refunds")
    .insert({
      org_id: auth.orgId,
      payment_intent_id: intent.id,
      amount: requested,
      reason: body.reason ? String(body.reason).slice(0, 500) : null,
      status: "pending",
      metadata: { origin: "paidly_pay", mock: isMockPaymentsEnabled() },
    })
    .select("*")
    .single();

  if (error) {
    if (/payment_refunds|schema cache|does not exist/i.test(error.message || "")) {
      const metadata = {
        ...(intent.metadata && typeof intent.metadata === "object" ? intent.metadata : {}),
        pending_refund: {
          amount: requested,
          reason: body.reason || null,
          requested_at: new Date().toISOString(),
        },
      };
      await supabaseAdmin.from("payment_intents").update({ metadata, updated_at: new Date().toISOString() }).eq("id", intent.id);
      return sendPaidlyJson(
        res,
        202,
        {
          ...publicPaymentIntent(intent),
          refund: { status: "pending", amount: requested, reason: body.reason || null },
        },
        requestId
      );
    }
    throw error;
  }

  return sendPaidlyJson(
    res,
    202,
    {
      ...publicPaymentIntent(intent),
      refund: {
        id: refund.id,
        status: refund.status,
        amount: roundMoney(refund.amount),
        reason: refund.reason,
      },
    },
    requestId
  );
}

async function handleDevices(req, res, requestId, auth, parts) {
  if (!(await enforcePaidlyPayRateLimit(res, "devices", req, requestId))) return;
  const deviceId = parts[1] || "";
  const action = parts[2] || "";

  if (parts.length === 1 && req.method === "GET") {
    let query = supabaseAdmin
      .from("paidly_devices")
      .select("id, org_id, company_id, user_id, device_name, platform, os_version, app_version, status, last_seen_at, created_at")
      .eq("org_id", auth.orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (auth.companyId) query = query.eq("company_id", auth.companyId);
    const { data, error } = await query;
    if (error) throw error;
    return sendPaidlyJson(res, 200, { devices: data || [] }, requestId);
  }

  if (parts.length === 1 && req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { data, error } = await supabaseAdmin
      .from("paidly_devices")
      .insert({
        org_id: auth.orgId,
        company_id: auth.companyId || null,
        user_id: isValidUuid(body.user_id) ? body.user_id : null,
        device_name: String(body.device_name || "Paidly Pay").slice(0, 120),
        platform: body.platform ? String(body.platform).slice(0, 40) : null,
        os_version: body.os_version ? String(body.os_version).slice(0, 40) : null,
        app_version: body.app_version ? String(body.app_version).slice(0, 40) : null,
        status: "active",
      })
      .select("id, org_id, company_id, user_id, device_name, platform, os_version, app_version, status, last_seen_at, created_at")
      .single();
    if (error) throw error;
    return sendPaidlyJson(res, 201, { device: data }, requestId);
  }

  if (action === "revoke" && req.method === "POST") {
    const device = await loadActiveDevice(auth, deviceId);
    if (!device) {
      return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.NOT_FOUND, "Device not found", requestId);
    }
    const { data, error } = await supabaseAdmin
      .from("paidly_devices")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", device.id)
      .eq("org_id", auth.orgId)
      .select("id, status")
      .single();
    if (error) throw error;
    return sendPaidlyJson(res, 200, { device: data }, requestId);
  }

  return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.NOT_FOUND, "Not found", requestId);
}

async function verifyIncomingWebhook(req) {
  const rawBody = await captureRawBody(req);
  if (typeof rawBody !== "string") {
    return {
      ok: false,
      status: 401,
      code: PAIDLY_PAY_ERROR.MISSING_SIGNATURE,
      message: "Webhook signature requires the raw request body",
    };
  }
  const signature = readPosSignature(req);
  if (!signature) {
    return { ok: false, status: 401, code: PAIDLY_PAY_ERROR.MISSING_SIGNATURE, message: "Missing X-POS-Signature" };
  }
  const secrets = webhookSecretsToTry(req.paidlyAuth);
  if (!secrets.length) {
    return { ok: false, status: 401, code: PAIDLY_PAY_ERROR.INVALID_SIGNATURE, message: "Webhook secret is not configured" };
  }
  const matched = secrets.some((secret) => verifyPaidlyPaySignature(rawBody, signature, secret));
  if (!matched) {
    return { ok: false, status: 401, code: PAIDLY_PAY_ERROR.INVALID_SIGNATURE, message: "Invalid webhook signature" };
  }
  let body;
  try {
    body = parseJsonObject(rawBody);
  } catch {
    return { ok: false, status: 400, code: PAIDLY_PAY_ERROR.MALFORMED_BODY, message: "Malformed JSON body" };
  }
  req.rawBody = rawBody;
  req.body = body;
  return { ok: true, body, rawBody };
}

async function handlePaymentWebhook(req, res, requestId) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return sendPaidlyError(res, 405, PAIDLY_PAY_ERROR.METHOD_NOT_ALLOWED, "Method not allowed", requestId);
  }
  if (!(await enforcePaidlyPayRateLimit(res, "webhooks", req, requestId))) return;

  const verified = await verifyIncomingWebhook(req);
  if (!verified?.ok) {
    return sendPaidlyError(res, verified?.status || 401, verified?.code, verified?.message || "Unauthorized", requestId);
  }

  const body = verified.body;
  const eventType = String(body.event || body.type || "").trim().toLowerCase();
  const providerEventId = String(body.provider_event_id || body.event_id || body.id || "").trim();
  const intentId = String(body.payment_intent_id || body.intent_id || "").trim();

  if (!isKnownPaidlyPayWebhookEvent(eventType)) {
    logPaidlyRequest({
      requestId,
      endpoint: "/api/paidly/webhooks/payment",
      status: 200,
      durationMs: 0,
      errorCategory: PAIDLY_PAY_ERROR.UNKNOWN_EVENT,
    });
    return sendPaidlyJson(res, 200, { ok: true, ignored: true, event: eventType || null }, requestId);
  }

  if (eventType === "pos.sale.created") {
    return handlePosSaleWebhook(req, res, requestId, body);
  }

  const nextStatus = intentStatusFromWebhookEvent(eventType);
  if (!nextStatus) {
    return sendPaidlyJson(res, 200, { ok: true, ignored: true, event: eventType }, requestId);
  }

  if (!intentId) {
    return sendPaidlyError(res, 400, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "payment_intent_id is required", requestId);
  }

  const { data: intent, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("id", intentId)
    .eq("source_kind", "pos")
    .maybeSingle();
  if (error) throw error;
  if (!intent) {
    return sendPaidlyError(res, 400, PAIDLY_PAY_ERROR.PAYMENT_INTENT_NOT_FOUND, "Unknown payment intent", requestId);
  }

  const eventKey = providerEventId || `evt_${eventType}_${intent.id}`;
  const existingEvent = await findProviderEvent(intent.org_id, eventKey);
  if (existingEvent) {
    return sendPaidlyJson(res, 200, { ok: true, duplicate: true, payment_intent_id: intent.id }, requestId);
  }

  const eventPayload = { event: eventType, payment_intent_id: intent.id };

  if (eventType === "payment.refunded" || eventType === "payment.partially_refunded") {
    if (!isConfirmedPaymentIntent(intent.status) && intent.status !== "refunded") {
      return sendPaidlyError(res, 422, PAIDLY_PAY_ERROR.PAYMENT_NOT_REFUNDABLE, "Payment is not refundable", requestId);
    }
    const applied =
      eventType === "payment.refunded"
        ? await applyVerifiedIntentStatus(intent, PAYMENT_INTENT_STATUS.refunded, {
            source: "paidly_pay_webhook",
            metadata: { refunded_via: "paidly_pay" },
          })
        : { intent, duplicate: false };
    await supabaseAdmin
      .from("payment_refunds")
      .update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("payment_intent_id", intent.id)
      .eq("status", "pending");
    await rememberProviderEvent({
      orgId: intent.org_id,
      providerEventId: eventKey,
      eventType,
      paymentIntentId: intent.id,
      payload: eventPayload,
    });
    return sendPaidlyJson(
      res,
      200,
      { ok: true, duplicate: Boolean(applied.duplicate), payment_intent: publicPaymentIntent(applied.intent) },
      requestId
    );
  }

  try {
    const applied = await applyVerifiedProviderEvent({
      intentId: intent.id,
      nextStatus,
      externalId: providerEventId || null,
      amount: body.amount == null || body.amount === "" ? undefined : body.amount,
      metadata: {
        webhook_verified: true,
        terminal_confirmed: nextStatus === "paid",
        paidly_pay_event: eventType,
        mock: isMockPaymentsEnabled() && String(body.mock || "") !== "false",
      },
    });
    await rememberProviderEvent({
      orgId: intent.org_id,
      providerEventId: eventKey,
      eventType,
      paymentIntentId: intent.id,
      payload: eventPayload,
    });
    return sendPaidlyJson(
      res,
      200,
      {
        ok: true,
        duplicate: Boolean(applied.duplicate),
        payment_intent: publicPaymentIntent(applied.intent),
        settlement: applied.settlement
          ? {
              settled: applied.settlement.settled,
              duplicate: applied.settlement.duplicate,
              sale_id: applied.settlement.saleId || null,
            }
          : null,
      },
      requestId
    );
  } catch (err) {
    if (err?.code === "AMOUNT_MISMATCH") {
      return sendPaidlyError(res, 409, err.code, err.message, requestId);
    }
    if (err?.code === "INVALID_INTENT_TRANSITION") {
      return sendPaidlyError(res, 409, err.code, err.message, requestId);
    }
    throw err;
  }
}

async function handlePosSaleWebhook(req, res, requestId, body) {
  const transactionId = String(body.transaction_id || body.pos_transaction_id || "").trim();
  if (!transactionId) {
    return sendPaidlyError(res, 400, PAIDLY_PAY_ERROR.TRANSACTION_NOT_FOUND, "transaction_id is required", requestId);
  }
  const { data: intent, error } = await supabaseAdmin
    .from("payment_intents")
    .select("*")
    .eq("id", transactionId)
    .eq("source_kind", "pos")
    .maybeSingle();
  if (error) throw error;
  if (!intent) {
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.TRANSACTION_NOT_FOUND, "Transaction not found", requestId);
  }
  const sale = await loadSaleForIntent(intent);
  const authoritative = publicTransaction(intent, sale);
  if (body.amount != null && roundMoney(body.amount) !== authoritative.amount) {
    console.info(
      JSON.stringify({
        msg: "paidly_pay_pos_webhook_amount_ignored",
        request_id: requestId,
        transaction_id: intent.id,
      })
    );
  }
  return sendPaidlyJson(
    res,
    200,
    {
      ok: true,
      event: "pos.sale.created",
      transaction: authoritative,
    },
    requestId
  );
}

export async function handlePaidlyPayApi(req, res) {
  const started = Date.now();
  const requestId = newPaidlyRequestId(req);
  const parts = parsePaidlyParts(req);
  const endpoint = paidlyEndpointFromParts(parts);
  req.body = normalizeRequestBody(req);
  applyPaidlyPayCors(req, res);
  if (req.method === "OPTIONS") return res.status(200).end();

  let errorCategory = null;
  let statusForLog = 200;
  let companyId = null;

  try {
    const head = (parts[0] || "").toLowerCase();
    if (!head || (head === "health" && parts.length === 1)) {
      if (!head) {
        return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.NOT_FOUND, "Not found", requestId);
      }
      const result = await handleHealth(req, res, requestId);
      statusForLog = res.statusCode;
      return result;
    }

    if (head === "webhooks" && parts[1] === "payment") {
      const result = await handlePaymentWebhook(req, res, requestId);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "webhooks" && parts[1] === "pos") {
      if (!(await enforcePaidlyPayRateLimit(res, "webhooks", req, requestId))) {
        statusForLog = 429;
        return;
      }
      const verified = await verifyIncomingWebhook(req);
      if (!verified?.ok) {
        statusForLog = verified?.status || 401;
        return sendPaidlyError(res, verified?.status || 401, verified?.code, verified?.message || "Unauthorized", requestId);
      }
      const result = await handlePosSaleWebhook(req, res, requestId, verified.body);
      statusForLog = res.statusCode;
      return result;
    }

    const scope =
      head === "transactions"
        ? "transactions:read"
        : head === "devices"
          ? "devices:manage"
          : parts[2] === "cancel"
            ? "payments:cancel"
            : parts[2] === "refund"
              ? "payments:refund"
              : req.method === "POST"
                ? "payments:create"
                : "payments:read";

    const auth = await requirePaidlyPayAuth(req, res, requestId, scope);
    if (!auth) {
      statusForLog = res.statusCode || 401;
      errorCategory = PAIDLY_PAY_ERROR.UNAUTHORIZED;
      return;
    }
    companyId = auth.companyId;

    if (head === "transactions" && parts.length === 1) {
      const result = await handleListTransactions(req, res, requestId, auth);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "transactions" && parts.length === 2) {
      const result = await handleGetTransaction(req, res, requestId, auth, parts[1]);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "payment-intents" && parts.length === 1) {
      const result = await handleCreatePaymentIntent(req, res, requestId, auth);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "payment-intents" && parts.length === 2) {
      const result = await handleGetPaymentIntent(req, res, requestId, auth, parts[1]);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "payment-intents" && parts[2] === "cancel") {
      const result = await handleCancelPaymentIntent(req, res, requestId, auth, parts[1]);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "payment-intents" && parts[2] === "simulate") {
      const result = await handleSimulatePaymentIntent(req, res, requestId, auth, parts[1]);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "payment-intents" && parts[2] === "refund") {
      const result = await handleRefundPaymentIntent(req, res, requestId, auth, parts[1]);
      statusForLog = res.statusCode;
      return result;
    }
    if (head === "devices") {
      const result = await handleDevices(req, res, requestId, auth, parts);
      statusForLog = res.statusCode;
      return result;
    }

    statusForLog = 404;
    return sendPaidlyError(res, 404, PAIDLY_PAY_ERROR.NOT_FOUND, "Not found", requestId);
  } catch (err) {
    errorCategory = err?.code || "INTERNAL";
    statusForLog = err?.status || 500;
    if (err?.code === PAIDLY_PAY_ERROR.CROSS_COMPANY_DENIED) {
      return sendPaidlyError(res, 403, err.code, err.message, requestId);
    }
    const message = process.env.NODE_ENV === "production" ? "Request failed" : err?.message || "Request failed";
    return sendPaidlyError(res, statusForLog >= 400 ? statusForLog : 500, errorCategory, message, requestId);
  } finally {
    logPaidlyRequest({
      requestId,
      endpoint,
      companyId,
      status: statusForLog || res.statusCode,
      durationMs: Date.now() - started,
      errorCategory,
    });
  }
}

