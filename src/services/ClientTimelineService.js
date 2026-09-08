import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { createPageUrl, createViewDocumentUrl } from "@/utils";
import {
  CLIENT_TIMELINE_PAGE_SIZE,
  normalizeTimelineItem,
} from "@shared/clients/clientRelationshipTimeline.js";

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

async function authHeaders() {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function readApi(res, fallback) {
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
    throw new Error((typeof json?.error === "string" && json.error) || fallback);
  }
  return json;
}

function pickTs(row, ...keys) {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return new Date(0).toISOString();
}

/**
 * Fallback when the company timeline API is unavailable: one row per invoice/quote/payment.
 */
export function buildClientTimelineEvents({ invoices = [], quotes = [], payments = [], currency = "ZAR" } = {}) {
  const cur = (currency || "ZAR").trim() || "ZAR";
  const money = (n) => {
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(Number(n) || 0);
    } catch {
      return `${cur} ${(Number(n) || 0).toFixed(2)}`;
    }
  };
  const out = [];
  for (const inv of invoices) {
    if (!inv?.id) continue;
    const num = inv.invoice_number || String(inv.id).slice(0, 8);
    out.push(
      normalizeTimelineItem({
        id: `inv-${inv.id}`,
        origin: "invoices",
        eventType: String(inv.status || "created").toLowerCase() === "paid" ? "paid" : "created",
        sourceKind: "invoice",
        documentType: "invoice",
        documentId: inv.id,
        documentNumber: num,
        occurredAt: pickTs(inv, "updated_at", "updated_date", "created_at", "created_date"),
        amount: inv.total_amount,
        href: createViewDocumentUrl("invoice", inv.id),
        title: `Invoice #${num} · ${String(inv.status || "draft").replace(/_/g, " ")}`,
        description: inv.project_title || "",
      })
    );
  }
  for (const q of quotes) {
    if (!q?.id) continue;
    const num = q.quote_number || String(q.id).slice(0, 8);
    out.push(
      normalizeTimelineItem({
        id: `quo-${q.id}`,
        origin: "quotes",
        eventType: "created",
        sourceKind: "quote",
        documentType: "quote",
        documentId: q.id,
        documentNumber: num,
        occurredAt: pickTs(q, "updated_at", "sent_date", "created_at", "created_date"),
        amount: q.total_amount,
        href: createViewDocumentUrl("quote", q.id),
        title: `Quote #${num} · ${String(q.status || "draft").replace(/_/g, " ")}`,
        description: q.project_title || "",
      })
    );
  }
  for (const p of payments) {
    if (!p?.id) continue;
    const invId = p.invoice_id;
    out.push(
      normalizeTimelineItem({
        id: `pay-${p.id}`,
        origin: "payments",
        eventType: "paid",
        sourceKind: "invoice",
        documentType: "invoice",
        documentId: invId || null,
        occurredAt: pickTs(p, "paid_at", "created_at", "created_date"),
        amount: p.amount,
        href:
          invId && String(invId).trim()
            ? `${createPageUrl("ViewInvoice")}?id=${encodeURIComponent(invId)}`
            : createPageUrl("Invoices"),
        title: `Payment received · ${money(p.amount)}`,
        description: p.reference || p.method || "",
      })
    );
  }
  out.sort((a, b) => (Date.parse(b.occurredAt) || 0) - (Date.parse(a.occurredAt) || 0));
  return out;
}

export async function fetchClientRelationshipTimeline(clientId, params = {}) {
  const headers = await authHeaders();
  const qs = new URLSearchParams();
  qs.set("client_id", clientId);
  qs.set("limit", String(params.limit || CLIENT_TIMELINE_PAGE_SIZE));
  if (params.category && params.category !== "all") qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.before) qs.set("before", params.before);
  if (params.document_id) qs.set("document_id", params.document_id);
  if (params.document_type) qs.set("document_type", params.document_type);
  if (params.channel) qs.set("channel", params.channel);
  const res = await apiRequest(`${apiBase()}/api/company/timeline?${qs.toString()}`, {
    method: "GET",
    headers,
  });
  const json = await readApi(res, "Could not load client timeline");
  return json.data || json;
}

export async function createClientTimelineNote(clientId, body) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/company/client-notes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ client_id: clientId, body }),
  });
  const json = await readApi(res, "Could not save note");
  return json.data;
}

export async function updateClientTimelineNote(noteId, body) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/company/client-notes`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ id: noteId, body }),
  });
  const json = await readApi(res, "Could not update note");
  return json.data;
}

export async function archiveClientTimelineNote(noteId) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/company/client-notes?id=${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    headers,
  });
  const json = await readApi(res, "Could not archive note");
  return json.data;
}

export async function createClientRelationshipEvent(clientId, payload) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/company/client-events`, {
    method: "POST",
    headers,
    body: JSON.stringify({ client_id: clientId, ...payload }),
  });
  const json = await readApi(res, "Could not log interaction");
  return json.data;
}
