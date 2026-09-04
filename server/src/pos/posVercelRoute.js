/**
 * Vercel Hobby only invokes `api/pos/[[...path]].js` for **one** extra path
 * segment (`/api/pos/registers`). Nested URLs (`/api/pos/oauth/status`) never
 * reach this file unless `vercel.json` rewrites them onto a one-segment alias
 * or `/api/pos/route?__pos=…`.
 *
 * Express (`server/src/pos/posApiRoutes.js`) still uses the nested URLs.
 */

const DUMMY_SEGMENT = "route";

export function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  if (value == null || value === "") return "";
  return String(value).trim();
}

export function normalizePosPathSegments(raw) {
  if (Array.isArray(raw)) {
    return raw.flatMap((part) => String(part).split("/")).filter(Boolean);
  }
  if (raw == null || raw === "") return [];
  const text = String(raw);
  try {
    return decodeURIComponent(text).split("/").filter(Boolean);
  } catch {
    return text.split("/").filter(Boolean);
  }
}

function partsFromRequestUrl(req) {
  const rawUrl = String(req.url || "");
  const qIndex = rawUrl.indexOf("?");
  const pathname = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl;
  const search = qIndex >= 0 ? rawUrl.slice(qIndex + 1) : "";
  let params;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = null;
  }
  const fromRewrite = params?.get("__pos");
  if (fromRewrite) return normalizePosPathSegments(fromRewrite);

  const rest = pathname.replace(/^\/api\/pos\/?/i, "");
  const parts = rest.split("/").filter(Boolean);
  if (parts[0] === DUMMY_SEGMENT) return parts.slice(1);
  return parts;
}

/**
 * @param {{ url?: string, query?: Record<string, unknown> }} req
 * @returns {null | { route: string, id?: string, token?: string, provider?: string, parts?: string[] }}
 */
export function resolvePosRoute(req) {
  const query = req?.query && typeof req.query === "object" ? req.query : {};
  const queryId = firstQueryValue(query.id);
  const queryToken = firstQueryValue(query.token);
  const queryProvider = firstQueryValue(query.provider);

  let parts = normalizePosPathSegments(query.__pos);
  if (parts.length === 0) {
    parts = normalizePosPathSegments(query.path);
  }
  if (parts[0] === DUMMY_SEGMENT) {
    const rest = parts.slice(1);
    parts = rest.length > 0 ? rest : partsFromRequestUrl(req);
  }
  if (parts.length === 0) {
    parts = partsFromRequestUrl(req);
  }

  const head = parts[0] || "";
  const second = parts[1] || "";
  const third = parts[2] || "";

  if (head === "invite-activate") return { route: "invite-activate" };
  if (head === "access-end") return { route: "access-end" };
  if (head === "access") return { route: "access" };
  if (head === "oauth-status") return { route: "oauth-status" };
  if (head === "oauth-square-start") return { route: "oauth-square-start" };
  if (head === "oauth-square-callback") return { route: "oauth-square-callback" };
  if (head === "oauth-yoco-connect") return { route: "oauth-yoco-connect" };
  if (head === "receipt-email") return { route: "receipt-email" };
  if (head === "sale-audit") {
    return { route: "sale-audit", id: queryId || second };
  }
  if (head === "webhook-token") {
    return { route: "webhook", token: queryToken || second };
  }
  if (head === "webhook-provider") {
    return { route: "webhook-provider", provider: queryProvider || second };
  }
  if (head === "register-by-id") {
    return { route: "register-by-id", id: queryId || second };
  }
  if (head === "session-by-id") {
    return { route: "session-by-id", id: queryId || second };
  }
  if (head === "session-close") {
    return { route: "session-close", id: queryId || second };
  }
  if (head === "connection-by-id") {
    const id = queryId || second;
    return { route: "connection-by-id", parts: ["connections", id], id };
  }

  if (head === "webhook") {
    if (second === "provider" && (third || queryProvider)) {
      return { route: "webhook-provider", provider: third || queryProvider };
    }
    if (second || queryToken) return { route: "webhook", token: second || queryToken };
  }

  if (head === "oauth") {
    if (second === "square" && third === "start") return { route: "oauth-square-start" };
    if (second === "callback" && third === "square") return { route: "oauth-square-callback" };
    if (second === "yoco" && third === "connect") return { route: "oauth-yoco-connect" };
    if (second === "status") return { route: "oauth-status" };
  }

  if (head === "sales") {
    if (parts[1] && parts[2] === "audit") return { route: "sale-audit", id: parts[1] };
    return { route: "sales" };
  }
  if (head === "catalog") return { route: "catalog" };
  if (head === "checkout") return { route: "checkout" };
  if (head === "return") return { route: "return" };
  if (head === "receipt" && second === "email") return { route: "receipt-email" };
  if (head === "invoice") return { route: "invoice" };
  if (head === "registers") {
    if (parts.length === 1) return { route: "registers-list" };
    if (parts[1]) return { route: "register-by-id", id: parts[1] };
  }
  if (head === "sessions") {
    if (parts.length === 1) return { route: "sessions-list" };
    if (parts[2] === "close") return { route: "session-close", id: parts[1] };
    if (parts[1]) return { route: "session-by-id", id: parts[1] };
  }

  if (head === "connections") {
    if (parts.length === 1) return { route: "connections-list", parts };
    if (parts[1]) return { route: "connection-by-id", parts, id: parts[1] };
  }

  const urlPath = String(req.url || "").split("?")[0] || "";

  if (/\/webhook\/provider\/([^/]+)/i.test(urlPath)) {
    const m = urlPath.match(/\/webhook\/provider\/([^/]+)/i);
    return { route: "webhook-provider", provider: m?.[1] };
  }

  const webhookMatch = urlPath.match(/\/api\/pos\/webhook\/([^/]+)/i);
  if (webhookMatch?.[1] && webhookMatch[1] !== "provider") {
    return { route: "webhook", token: webhookMatch[1] };
  }

  if (urlPath.endsWith("/invite-activate") || /\/invite-activate$/i.test(urlPath)) {
    return { route: "invite-activate" };
  }
  if (urlPath.endsWith("/access-end") || /\/access-end$/i.test(urlPath)) {
    return { route: "access-end" };
  }
  if (urlPath.endsWith("/access") || /\/access$/i.test(urlPath)) {
    return { route: "access" };
  }
  if (urlPath.includes("/oauth/square/start") || urlPath.endsWith("/oauth-square-start")) {
    return { route: "oauth-square-start" };
  }
  if (urlPath.includes("/oauth/callback/square") || urlPath.endsWith("/oauth-square-callback")) {
    return { route: "oauth-square-callback" };
  }
  if (urlPath.includes("/oauth/yoco/connect") || urlPath.endsWith("/oauth-yoco-connect")) {
    return { route: "oauth-yoco-connect" };
  }
  if (urlPath.includes("/oauth/status") || urlPath.endsWith("/oauth-status")) {
    return { route: "oauth-status" };
  }

  const saleAuditMatch = urlPath.match(/\/sales\/([^/]+)\/audit/i);
  if (saleAuditMatch?.[1]) {
    return { route: "sale-audit", id: saleAuditMatch[1] };
  }
  if (urlPath.endsWith("/sales") || /\/sales$/i.test(urlPath)) {
    return { route: "sales" };
  }
  if (urlPath.endsWith("/catalog") || /\/catalog$/i.test(urlPath)) {
    return { route: "catalog" };
  }
  if (urlPath.endsWith("/checkout") || /\/checkout$/i.test(urlPath)) {
    return { route: "checkout" };
  }
  if (urlPath.endsWith("/return") || /\/return$/i.test(urlPath)) {
    return { route: "return" };
  }
  if (urlPath.includes("/receipt/email") || urlPath.endsWith("/receipt-email")) {
    return { route: "receipt-email" };
  }
  if (urlPath.endsWith("/invoice") || /\/invoice$/i.test(urlPath)) {
    return { route: "invoice" };
  }
  if (/\/registers$/i.test(urlPath)) return { route: "registers-list" };
  const registerMatch = urlPath.match(/\/registers\/([^/]+)/i);
  if (registerMatch?.[1]) return { route: "register-by-id", id: registerMatch[1] };
  if (/\/sessions$/i.test(urlPath)) return { route: "sessions-list" };
  const sessionCloseMatch = urlPath.match(/\/sessions\/([^/]+)\/close/i);
  if (sessionCloseMatch?.[1]) return { route: "session-close", id: sessionCloseMatch[1] };
  const sessionMatch = urlPath.match(/\/sessions\/([^/]+)/i);
  if (sessionMatch?.[1]) return { route: "session-by-id", id: sessionMatch[1] };

  if (/\/connections$/i.test(urlPath)) return { route: "connections-list", parts: [] };
  const connectionMatch = urlPath.match(/\/connections\/([^/]+)/i);
  if (connectionMatch?.[1]) {
    return {
      route: "connection-by-id",
      parts: ["connections", connectionMatch[1]],
      id: connectionMatch[1],
    };
  }

  return null;
}
