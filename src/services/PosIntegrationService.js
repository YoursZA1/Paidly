/**
 * POS integration API client.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";
import { posApiFetch, posAuthHeaders } from "@/lib/pos/posAccessClient";

async function authHeaders({ includeJsonContentType = true } = {}) {
  const headers = await posAuthHeaders({ includeJsonContentType });
  if (!headers.Authorization) throw new Error("Not authenticated");
  return headers;
}

async function posServiceRequest(url, init = {}) {
  const headers = await authHeaders({
    includeJsonContentType: Boolean(init.body),
  });
  const merged = {
    credentials: "include",
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  };
  try {
    const session = await getStableSession();
    if (session?.access_token) return apiRequest(url, merged);
  } catch {
    /* POS access-pass has no Paidly Auth JWT */
  }
  return posApiFetch(url, merged);
}

function parseApiJsonError(res, raw, fallbackMessage) {
  let json = {};
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch {
      json = {};
    }
  }
  if (res.ok) return json;
  const detail =
    (typeof json?.error === "string" && json.error) ||
    (typeof json?.message === "string" && json.message) ||
    (raw && !raw.trim().startsWith("{") ? raw.trim().slice(0, 240) : "") ||
    res.statusText ||
    `${fallbackMessage} (HTTP ${res.status})`;
  const err = new Error(detail);
  if (json?.code) err.code = json.code;
  if (json?.existing_id) err.existing_id = json.existing_id;
  throw err;
}

function apiBase() {
  return import.meta.env.DEV ? "" : getBackendBaseUrl();
}

export const POS_PROVIDERS = [
  { id: "generic", label: "Generic webhook", description: "Any POS that can POST JSON to a URL.", connectType: "manual" },
  { id: "yoco", label: "Yoco", description: "Connect with your Yoco secret API key — webhook is registered automatically.", connectType: "yoco_key" },
  { id: "square", label: "Square", description: "Sign in with Square to authorize Paidly.", connectType: "square_oauth" },
];

export async function listPosConnections() {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/connections`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS connections");
  return Array.isArray(json.connections) ? json.connections : [];
}

/**
 * @param {{ provider: string, label?: string }} payload
 */
export async function createPosConnection(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/connections`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      provider: payload.provider,
      label: payload.label,
    }),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not create POS connection");
}

/**
 * @param {string} connectionId
 * @param {{ label?: string, status?: string, rotate_secret?: boolean }} updates
 */
export async function updatePosConnection(connectionId, updates) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/connections/${encodeURIComponent(connectionId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not update POS connection");
}

export async function deletePosConnection(connectionId) {
  const headers = await authHeaders({ includeJsonContentType: false });
  const res = await posServiceRequest(`${apiBase()}/api/pos/connections/${encodeURIComponent(connectionId)}`, {
    method: "DELETE",
    headers,
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not delete POS connection");
}

/**
 * @param {{ limit?: number, today?: boolean }} [opts]
 */
export async function listPosSales(opts = {}) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.today) params.set("today", "1");
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await posServiceRequest(`${apiBase()}/api/pos/sales${qs}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS sales");
  return {
    sales: Array.isArray(json.sales) ? json.sales : [],
    totalToday: Number(json.total_today) || 0,
  };
}

export async function fetchPosSaleAudit(saleId) {
  const headers = await authHeaders({ includeJsonContentType: false });
  const res = await posServiceRequest(`${apiBase()}/api/pos/sales/${encodeURIComponent(saleId)}/audit`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS audit");
  return Array.isArray(json.events) ? json.events : [];
}

export async function fetchPosCatalog({ registerId } = {}) {
  const headers = await authHeaders();
  const qs = registerId ? `?register_id=${encodeURIComponent(registerId)}` : "";
  const res = await posServiceRequest(`${apiBase()}/api/pos/catalog${qs}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS catalog");
  return Array.isArray(json.products) ? json.products : [];
}

export async function listPosRegisters() {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/registers`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load registers");
  return {
    registers: Array.isArray(json.registers) ? json.registers : [],
    members: Array.isArray(json.members) ? json.members : [],
  };
}

/**
 * @param {{ name: string, status?: string, company_id?: string|null, assigned_staff_id?: string|null, opening_balance?: number }} payload
 */
export async function createPosRegister(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/registers`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not create register");
}

/**
 * @param {string} registerId
 * @param {{ name?: string, status?: string, company_id?: string|null, assigned_staff_id?: string|null, opening_balance?: number }} updates
 */
export async function updatePosRegister(registerId, updates) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/registers/${encodeURIComponent(registerId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not update register");
}

export async function disablePosRegister(registerId) {
  const headers = await authHeaders({ includeJsonContentType: false });
  const res = await posServiceRequest(`${apiBase()}/api/pos/registers/${encodeURIComponent(registerId)}`, {
    method: "DELETE",
    headers,
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not disable register");
}

/**
 * @param {{ register_id?: string, status?: "open"|"closed", limit?: number }} [opts]
 */
export async function listPosSessions(opts = {}) {
  const headers = await authHeaders();
  const params = new URLSearchParams();
  if (opts.register_id) params.set("register_id", String(opts.register_id));
  if (opts.status) params.set("status", String(opts.status));
  if (opts.limit) params.set("limit", String(opts.limit));
  const qs = params.toString() ? `?${params.toString()}` : "";
  const res = await posServiceRequest(`${apiBase()}/api/pos/sessions${qs}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS sessions");
  return Array.isArray(json.sessions) ? json.sessions : [];
}

export async function getPosSession(sessionId) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/sessions/${encodeURIComponent(sessionId)}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS session");
  return json.session || null;
}

/**
 * @param {{ register_id: string, opening_balance?: number, notes?: string }} payload
 */
export async function openPosSession(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not start shift");
  return json.session || null;
}

/**
 * @param {string} sessionId
 * @param {{ closing_cash: number, notes?: string }} payload
 */
export async function closePosSession(sessionId, payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not close shift");
  return json.session || null;
}

/**
 * @param {{
 *   items: Array<{ product_id: string, quantity: number, unit_price?: number }>,
 *   payment_method: "cash"|"card"|"digital"|"other",
 *   discount_amount?: number,
 *   amount_tendered?: number,
 *   client_id?: string|null,
 *   company_id?: string|null,
 *   register_id?: string|null,
 *   currency?: string,
 *   idempotency_key?: string,
 *   brand_name?: string,
 *   cashier_name?: string,
 *   customer_name?: string,
 *   customer_email?: string,
 * }} payload
 */
export async function checkoutPosSale(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not complete sale");
}

/**
 * @param {{
 *   sale_id: string,
 *   items?: Array<{ product_id: string, quantity: number }>,
 *   refund_as_cash?: boolean,
 *   payment_method?: string,
 *   idempotency_key?: string,
 * }} payload
 */
export async function returnPosSale(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/return`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not process return");
}

/**
 * Optional tax-invoice copy of a settled till sale. Does not create a receivable.
 * @param {{ sale_id: string, client_id?: string }} payload
 */
export async function convertPosSaleToInvoice(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/invoice`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      sale_id: payload.sale_id,
      client_id: payload.client_id || undefined,
    }),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not convert sale to invoice");
}

/**
 * Email a till receipt. Does not create an invoice.
 * @param {{ sale_id: string, to: string, brand_name?: string, cashier_name?: string, customer_name?: string, base64PDF?: string }} payload
 */
export async function emailPosReceipt(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/receipt/email`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not email receipt");
}

export function buildGenericWebhookExample() {
  return {
    id: "sale-12345",
    status: "completed",
    total: 150.0,
    currency: "ZAR",
    payment_method: "card",
    occurred_at: new Date().toISOString(),
    items: [
      { sku: "SKU-001", quantity: 2, unit_price: 75.0, name: "Example product" },
    ],
  };
}

export async function getPosOAuthStatus() {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/oauth/status`, { headers });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not load POS OAuth status");
}

export async function startSquareOAuthConnect() {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/oauth/square/start`, {
    method: "POST",
    headers,
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not start Square connect");
}

/**
 * @param {{ api_secret_key: string, label?: string }} payload
 */
export async function connectYocoPos(payload) {
  const headers = await authHeaders();
  const res = await posServiceRequest(`${apiBase()}/api/pos/oauth/yoco/connect`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      api_secret_key: payload.api_secret_key,
      label: payload.label,
    }),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not connect Yoco");
}
