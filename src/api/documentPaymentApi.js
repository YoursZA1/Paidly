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

export async function startDocumentPayment({ invoiceId, shareToken = null, retry = false }) {
  const headers = shareToken ? publicHeaders(shareToken) : await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/payment-intents/document-pay`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      invoice_id: invoiceId,
      share_token: shareToken || undefined,
      retry: retry || undefined,
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

export async function fetchOzowReturnStatus({ intentId, shareToken = null }) {
  const headers = shareToken ? publicHeaders(shareToken) : await authHeaders();
  const qs = new URLSearchParams({ intent: intentId });
  if (shareToken) qs.set("token", shareToken);
  const res = await apiRequest(`${apiBase()}/api/payment-intents/ozow-return?${qs}`, {
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
