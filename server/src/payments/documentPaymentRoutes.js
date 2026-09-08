import { requireOrgMember } from "../pos/posConnectionsRoutes.js";
import { resolvePublicAppOrigin } from "../companyInviteAppUrl.js";
import {
  bearerTokenFromReq,
  isValidShareTokenUuid,
  loadPublicInvoiceBundle,
  normalizeEmail,
  verifyPublicInvoiceViewerToken,
} from "../../../api/_publicInvoiceShared.js";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import { loadCompanyMembership } from "../companyRouteAccess.js";
import {
  createOrReuseDocumentPaymentIntent,
  documentPaymentSnapshot,
  remindDocumentPayment,
} from "./documentPaymentService.js";
import { getOrgPaymentIntent, mapPaymentIntentSchemaError, publicPaymentIntentView } from "./paymentEngine.js";
import { DOCUMENT_EVENT_ACTOR, DOCUMENT_EVENT_SOURCE, DOCUMENT_EVENT_TYPE } from "../../../shared/documents/documentEvents.js";
import { appendDocumentEventBestEffort } from "../documents/documentEventService.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function schemaError(res, err) {
  return jsonError(res, err?.status || 500, mapPaymentIntentSchemaError(err?.message), {
    code: err?.code,
  });
}

function requestOrigin(req) {
  const host = String(req.headers?.["x-forwarded-host"] || req.headers?.host || "").split(",")[0].trim();
  const proto = String(req.headers?.["x-forwarded-proto"] || "https").split(",")[0].trim();
  if (host && !/localhost|127\.0\.0\.1|\.vercel\.app/i.test(host)) {
    return `${proto}://${host}`;
  }
  return resolvePublicAppOrigin();
}

async function resolvePublicInvoiceAccess(req, invoiceId, shareToken) {
  const token = String(shareToken || "").trim();
  if (!token || !isValidShareTokenUuid(token)) {
    return { ok: false, status: 401, error: "A valid invoice share token is required" };
  }
  const bundle = await loadPublicInvoiceBundle(supabaseAdmin, token);
  if (bundle.error) {
    return { ok: false, status: bundle.status || 404, error: bundle.error };
  }
  const invoice = bundle.invoice;
  if (String(invoice.id) !== String(invoiceId)) {
    return { ok: false, status: 403, error: "Invoice does not match this payment link" };
  }
  const sentTo = invoice.sent_to_email ? normalizeEmail(invoice.sent_to_email) : "";
  if (sentTo) {
    const viewer = verifyPublicInvoiceViewerToken(bearerTokenFromReq(req));
    const okViewer =
      viewer &&
      viewer.shareToken.toLowerCase() === token.toLowerCase() &&
      viewer.email === sentTo;
    if (!okViewer) {
      return { ok: false, status: 401, error: "Email verification is required before paying" };
    }
  }
  return { ok: true, invoice, orgId: invoice.org_id, shareToken: token };
}

async function resolveDocumentPayAccess(req, res, body) {
  const invoiceId = String(body.invoice_id || body.document_id || "").trim();
  if (!invoiceId) {
    return { ok: false, response: jsonError(res, 422, "invoice_id is required") };
  }

  const shareToken = String(body.share_token || body.token || "").trim();
  if (shareToken) {
    const pub = await resolvePublicInvoiceAccess(req, invoiceId, shareToken);
    if (!pub.ok) {
      return { ok: false, response: jsonError(res, pub.status, pub.error) };
    }
    return { ok: true, orgId: pub.orgId, invoiceId, shareToken: pub.shareToken, createdBy: null };
  }

  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return { ok: false, response: gate.response };
  return {
    ok: true,
    orgId: gate.membership.orgId,
    invoiceId,
    shareToken: null,
    createdBy: gate.user.id,
  };
}

export async function handleDocumentPay(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const requestedKind = String(body.document_type || body.source_kind || "").trim().toLowerCase();
  if (requestedKind === "quote") {
    return jsonError(res, 422, "Quotes cannot create payment intents");
  }
  try {
    const access = await resolveDocumentPayAccess(req, res, body);
    if (!access.ok) return access.response;

    await appendDocumentEventBestEffort({
      orgId: access.orgId,
      sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
      sourceId: access.invoiceId,
      documentType: "invoice",
      eventType: DOCUMENT_EVENT_TYPE.clicked,
      actorType: access.shareToken ? DOCUMENT_EVENT_ACTOR.RECIPIENT : DOCUMENT_EVENT_ACTOR.USER,
      actorUserId: access.createdBy,
      action: body.retry ? "payment_cta_retry" : "payment_cta",
      channel: access.shareToken ? "invoice_public_page" : "invoice_owner",
      metadata: {
        action: body.retry ? "payment_cta_retry" : "payment_cta",
        source: access.shareToken ? "invoice_public_page" : "invoice_owner",
      },
    });

    const result = await createOrReuseDocumentPaymentIntent({
      orgId: access.orgId,
      invoiceId: access.invoiceId,
      createdBy: access.createdBy,
      shareToken: access.shareToken,
      forceNewAttempt: Boolean(body.retry),
      appOrigin: requestOrigin(req),
    });

    if (!result.redirectUrl) {
      return jsonError(res, 422, result.charge?.error || "Ozow payment could not be started", {
        code: result.charge?.code || "OZOW_REDIRECT_MISSING",
        payment_intent: publicPaymentIntentView(result.intent),
      });
    }

    return res.status(200).json({
      ok: true,
      payment_intent: publicPaymentIntentView(result.intent),
      redirect_url: result.redirectUrl,
      amount_due: result.amountDue,
      currency: result.currency,
      invoice_id: result.invoice.id,
      invoice_number: result.invoice.invoice_number,
    });
  } catch (err) {
    if (err?.status) return jsonError(res, err.status, err.message, { code: err.code });
    return schemaError(res, err);
  }
}

export async function handleDocumentRemind(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const gate = await requireOrgMember(req, res);
  if (!gate.ok) return gate.response;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const invoiceId = String(body.invoice_id || body.document_id || "").trim();
  if (!invoiceId) return jsonError(res, 422, "invoice_id is required");
  try {
    const result = await remindDocumentPayment({
      orgId: gate.membership.orgId,
      invoiceId,
      createdBy: gate.user.id,
      appOrigin: requestOrigin(req),
    });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (err?.status) {
      return jsonError(res, err.status, err.message, {
        code: err.code,
        retry_after_ms: err.retry_after_ms,
      });
    }
    return schemaError(res, err);
  }
}

export async function handleDocumentHistory(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const invoiceId = String(req.query?.invoice_id || req.query?.id || "").trim();
  if (!invoiceId) return jsonError(res, 422, "invoice_id is required");

  const shareToken = String(req.query?.token || req.query?.share_token || "").trim();
  try {
    let orgId;
    if (shareToken) {
      const pub = await resolvePublicInvoiceAccess(req, invoiceId, shareToken);
      if (!pub.ok) return jsonError(res, pub.status, pub.error);
      orgId = pub.orgId;
    } else {
      const gate = await requireOrgMember(req, res);
      if (!gate.ok) return gate.response;
      orgId = gate.membership.orgId;
    }
    const snapshot = await documentPaymentSnapshot(orgId, invoiceId);
    if (!snapshot) return jsonError(res, 404, "Invoice not found");
    return res.status(200).json({ ok: true, ...snapshot });
  } catch (err) {
    return schemaError(res, err);
  }
}

/**
 * Return URL / poll endpoint. Never marks the invoice paid.
 */
export async function handleOzowReturn(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return jsonError(res, 405, "Method not allowed");
  }
  const intentId = String(req.query?.intent || req.query?.id || "").trim();
  if (!intentId) return jsonError(res, 422, "intent is required");

  const shareToken = String(req.query?.token || req.query?.share_token || "").trim();
  try {
    let intent = null;
    if (shareToken) {
      const { data } = await supabaseAdmin
        .from("payment_intents")
        .select("*")
        .eq("id", intentId)
        .maybeSingle();
      intent = data;
      if (!intent?.document_id) return jsonError(res, 404, "Payment intent not found");
      const pub = await resolvePublicInvoiceAccess(req, intent.document_id, shareToken);
      if (!pub.ok) return jsonError(res, pub.status, pub.error);
    } else {
      const { user } = await getUserFromRequest(req);
      if (!user) return jsonError(res, 401, "Unauthorized");
      const membership = await loadCompanyMembership(supabaseAdmin, user.id);
      if (!membership?.orgId) return jsonError(res, 403, "No organization");
      intent = await getOrgPaymentIntent(membership.orgId, intentId);
    }

    if (!intent) return jsonError(res, 404, "Payment intent not found");
    const snapshot = intent.document_id
      ? await documentPaymentSnapshot(intent.org_id, intent.document_id)
      : null;
    return res.status(200).json({
      ok: true,
      confirmed: false,
      message: "Payment status is confirmed only after Ozow notifies Paidly.",
      payment_intent: publicPaymentIntentView(intent),
      snapshot,
    });
  } catch (err) {
    return schemaError(res, err);
  }
}
