/**
 * POS integration API client.
 */
import { getStableSession } from "@/core/auth/SessionCoordinator";
import { getBackendBaseUrl } from "@/api/backendClient";
import { apiRequest } from "@/utils/apiRequest";

async function authHeaders({ includeJsonContentType = true } = {}) {
  const session = await getStableSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const headers = { Authorization: `Bearer ${token}` };
  if (includeJsonContentType) headers["Content-Type"] = "application/json";
  return headers;
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
  throw new Error(detail);
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
  const res = await apiRequest(`${apiBase()}/api/pos/connections`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS connections");
  return Array.isArray(json.connections) ? json.connections : [];
}

/**
 * @param {{ provider: string, label?: string }} payload
 */
export async function createPosConnection(payload) {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/pos/connections`, {
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
  const res = await apiRequest(`${apiBase()}/api/pos/connections/${encodeURIComponent(connectionId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updates),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not update POS connection");
}

export async function deletePosConnection(connectionId) {
  const headers = await authHeaders({ includeJsonContentType: false });
  const res = await apiRequest(`${apiBase()}/api/pos/connections/${encodeURIComponent(connectionId)}`, {
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
  const res = await apiRequest(`${apiBase()}/api/pos/sales${qs}`, { headers });
  const raw = await res.text().catch(() => "");
  const json = parseApiJsonError(res, raw, "Could not load POS sales");
  return {
    sales: Array.isArray(json.sales) ? json.sales : [],
    totalToday: Number(json.total_today) || 0,
  };
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
  const res = await apiRequest(`${apiBase()}/api/pos/oauth/status`, { headers });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, "Could not load POS OAuth status");
}

export async function startSquareOAuthConnect() {
  const headers = await authHeaders();
  const res = await apiRequest(`${apiBase()}/api/pos/oauth/square/start`, {
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
  const res = await apiRequest(`${apiBase()}/api/pos/oauth/yoco/connect`, {
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
