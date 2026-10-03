import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { getPublicInvoiceViewerToken } from "@/lib/publicInvoiceViewerStorage";

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

async function authHeaders() {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function publicHeaders(shareToken) {
  const headers = { "Content-Type": "application/json" };
  const viewer = shareToken ? getPublicInvoiceViewerToken(shareToken) : null;
  if (viewer) headers.Authorization = `Bearer ${viewer}`;
  return headers;
}

async function parseJson(res, fallback) {
  const raw = await res.text().catch(() => "");
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = {};
    }
  }
  if (!res.ok) {
    const err = new Error(json.error || json.message || fallback);
    err.status = res.status;
    err.code = json.code;
    err.retryAfterMs = json.retry_after_ms;
    throw err;
  }
  return json;
}

/**
 * Pay now. In a Demo Mode workspace the server answers `{ demo: true, simulated: true }` instead of a
 * provider redirect; call again with `demoOutcome` ("succeeded" | "failed" | "processing") to apply
 * the simulated result (shared/demo/demoPayments.js).
 */
export async function startDocumentPayment({ invoiceId, shareToken = null, retry = false, demoOutcome = null, idempotencyKey = null }) {
  const headers = shareToken ? publicHeaders(shareToken) : await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-pay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      invoice_id: invoiceId,
      share_token: shareToken || undefined,
      retry: retry || undefined,
      demo_outcome: demoOutcome || undefined,
      idempotency_key: idempotencyKey || undefined,
    }),
  });
  return parseJson(res, "Could not start payment");
}

export async function remindDocumentPayment(invoiceId) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-remind`, {
    method: "POST",
    headers,
    body: JSON.stringify({ invoice_id: invoiceId }),
  });
  return parseJson(res, "Could not send reminder");
}

/**
 * Record money received offline (cash, EFT, card machine, cheque) against an invoice.
 * The Payment Engine creates and settles a cash payment_intent, writes the payment and derives the
 * invoice status; the browser never writes payments or a paid status itself.
 */
export async function recordDocumentPayment({
  invoiceId,
  amount,
  paymentMethod,
  paidAt = null,
  reference = null,
  notes = null,
  idempotencyKey = null,
}) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-record`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      invoice_id: invoiceId,
      amount,
      payment_method: paymentMethod || "cash",
      paid_at: paidAt || undefined,
      reference: reference || undefined,
      notes: notes || undefined,
      idempotency_key: idempotencyKey || undefined,
    }),
  });
  return parseJson(res, "Could not record payment");
}

/** Online providers that can take an invoice payment. `configured` is false when none is connected. */
export async function fetchDocumentOnlineProviders() {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/providers?source_kind=document`, {
    method: "GET",
    headers,
  });
  const json = await parseJson(res, "Could not load payment providers");
  return (Array.isArray(json.providers) ? json.providers : []).filter((provider) => provider.kind === "online");
}

export async function fetchDocumentPaymentHistory({ invoiceId, shareToken = null }) {
  const headers = shareToken ? publicHeaders(shareToken) : await authHeaders();
  const qs = new URLSearchParams({ invoice_id: invoiceId });
  if (shareToken) qs.set("token", shareToken);
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-history?${qs}`, {
    method: "GET",
    headers,
  });
  return parseJson(res, "Could not load payment history");
}

/** Poll after returning from the online payment provider. Never settles the invoice. */
export async function fetchPaymentReturnStatus({ intentId, shareToken = null }) {
  const headers = shareToken ? publicHeaders(shareToken) : await authHeaders();
  const qs = new URLSearchParams({ intent: intentId });
  if (shareToken) qs.set("token", shareToken);
  const res = await apiRequest(`${apiBase()}/api/payment-intents/payment-return?${qs}`, {
    method: "GET",
    headers,
  });
  return parseJson(res, "Could not load payment status");
}

export async function fetchDocumentTimeline({ documentId, sourceKind = "invoice" }) {
  const headers = await authHeaders();
  const qs = new URLSearchParams({
    document_id: documentId,
    source_kind: sourceKind,
  });
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-timeline?${qs}`, {
    method: "GET",
    headers,
  });
  return parseJson(res, "Could not load activity");
}

export async function fetchDocumentEngagementMetrics() {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-engagement`, {
    method: "GET",
    headers,
  });
  return parseJson(res, "Could not load engagement metrics");
}

export async function fetchOrgPaymentIntent(intentId) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/${encodeURIComponent(intentId)}`, {
    method: "GET",
    headers,
  });
  return parseJson(res, "Could not load payment intent");
}

export async function postPaymentIntentAction(intentId, body) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/${encodeURIComponent(intentId)}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body || {}),
  });
  return parseJson(res, "Could not update payment intent");
}
