import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handlePosConnectionsList,
  handlePosConnectionCreate,
  handlePosConnectionPatch,
  handlePosConnectionDelete,
  handlePosSalesList,
} from "../../server/src/pos/posConnectionsRoutes.js";
import { handlePosWebhook } from "../../server/src/pos/posWebhookHandler.js";
import {
  handleSquareOAuthStart,
  handleSquareOAuthCallback,
  handleYocoConnect,
  handlePosOAuthStatus,
} from "../../server/src/pos/posOAuthRoutes.js";

/**
 * Vercel: /api/pos/connections, /api/pos/sales, /api/pos/webhook/:token,
 *         /api/pos/oauth/*
 */
function normalizePosPathSegments(raw) {
  if (Array.isArray(raw)) {
    return raw.flatMap((part) => String(part).split("/")).filter(Boolean);
  }
  if (raw == null || raw === "") return [];
  return String(raw).split("/").filter(Boolean);
}

function resolvePosRoute(req) {
  const parts = normalizePosPathSegments(req.query?.path);
  const head = parts[0] || "";
  const second = parts[1] || "";
  const third = parts[2] || "";

  if (head === "webhook") {
    if (second === "provider" && third) {
      return { route: "webhook-provider", provider: third };
    }
    if (second) return { route: "webhook", token: second };
  }

  if (head === "oauth") {
    if (second === "square" && third === "start") return { route: "oauth-square-start" };
    if (second === "callback" && third === "square") return { route: "oauth-square-callback" };
    if (second === "yoco" && third === "connect") return { route: "oauth-yoco-connect" };
    if (second === "status") return { route: "oauth-status" };
  }

  if (head === "connections") {
    if (second) return { route: "connection-id", id: second };
    return { route: "connections" };
  }
  if (head === "sales") return { route: "sales" };

  const urlPath = String(req.url || "").split("?")[0] || "";

  if (/\/webhook\/provider\/([^/]+)/i.test(urlPath)) {
    const m = urlPath.match(/\/webhook\/provider\/([^/]+)/i);
    return { route: "webhook-provider", provider: m?.[1] };
  }

  const webhookMatch = urlPath.match(/\/api\/pos\/webhook\/([^/]+)/i);
  if (webhookMatch?.[1] && webhookMatch[1] !== "provider") {
    return { route: "webhook", token: webhookMatch[1] };
  }

  if (urlPath.includes("/oauth/square/start")) return { route: "oauth-square-start" };
  if (urlPath.includes("/oauth/callback/square")) return { route: "oauth-square-callback" };
  if (urlPath.includes("/oauth/yoco/connect")) return { route: "oauth-yoco-connect" };
  if (urlPath.includes("/oauth/status")) return { route: "oauth-status" };

  const connectionIdMatch = urlPath.match(/\/connections\/([^/]+)/i);
  if (connectionIdMatch?.[1]) {
    return { route: "connection-id", id: connectionIdMatch[1] };
  }
  if (urlPath.endsWith("/connections") || /\/connections$/i.test(urlPath)) {
    return { route: "connections" };
  }
  if (urlPath.endsWith("/sales") || /\/sales$/i.test(urlPath)) {
    return { route: "sales" };
  }

  return null;
}

export default async function handler(req, res) {
  const resolved = resolvePosRoute(req);
  if (!resolved) return res.status(404).json({ error: "Not found" });

  if (resolved.route === "webhook") {
    req.params = { ...(req.params || {}), token: resolved.token };
    return handlePosWebhook(req, res);
  }

  if (resolved.route === "webhook-provider") {
    req.params = { ...(req.params || {}), provider: resolved.provider };
    return handlePosWebhook(req, res);
  }

  if (resolved.route === "oauth-square-callback") {
    return handleSquareOAuthCallback(req, res);
  }

  applyApiCors(req, res, {
    methods: "GET, POST, PATCH, DELETE, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();

  req.body = normalizeRequestBody(req);

  if (resolved.route === "oauth-square-start") {
    if (req.method === "POST") return handleSquareOAuthStart(req, res);
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "oauth-yoco-connect") {
    if (req.method === "POST") return handleYocoConnect(req, res);
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "oauth-status") {
    if (req.method === "GET") return handlePosOAuthStatus(req, res);
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "connections") {
    if (req.method === "GET") return handlePosConnectionsList(req, res);
    if (req.method === "POST") return handlePosConnectionCreate(req, res);
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "connection-id") {
    req.params = { ...(req.params || {}), id: resolved.id };
    if (req.method === "PATCH") return handlePosConnectionPatch(req, res);
    if (req.method === "DELETE") return handlePosConnectionDelete(req, res);
    res.setHeader("Allow", "PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "sales") {
    if (req.method === "GET") return handlePosSalesList(req, res);
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(404).json({ error: "Not found" });
}
