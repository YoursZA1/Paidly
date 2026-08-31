import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handlePosSalesList,
  handlePosConnectionsList,
  handlePosConnectionCreate,
  handlePosConnectionPatch,
  handlePosConnectionDelete,
  requirePosPermission,
} from "../../server/src/pos/posConnectionsRoutes.js";
import {
  handleNativePosCatalog,
  handleNativePosCheckout,
  handleNativePosReturn,
} from "../../server/src/pos/posNativeCheckout.js";
import { handlePosReceiptEmail } from "../../server/src/pos/posReceiptEmail.js";
import { handlePosConvertToInvoice } from "../../server/src/pos/posSaleInvoice.js";
import { handlePosSaleAudit } from "../../server/src/pos/posAudit.js";
import {
  handlePosRegistersList,
  handlePosRegisterCreate,
  handlePosRegisterPatch,
  handlePosRegisterDelete,
} from "../../server/src/pos/posRegisters.js";
import {
  handlePosSessionsList,
  handlePosSessionOpen,
  handlePosSessionGet,
  handlePosSessionClose,
} from "../../server/src/pos/posRegisterSessions.js";
import { handlePosWebhook } from "../../server/src/pos/posWebhookHandler.js";
import { PERMISSIONS } from "../../server/src/companyRouteAccess.js";
import {
  handleSquareOAuthStart,
  handleSquareOAuthCallback,
  handleYocoConnect,
  handlePosOAuthStatus,
} from "../../server/src/pos/posOAuthRoutes.js";

/**
 * Vercel: /api/pos/sales, /api/pos/webhook/:token, /api/pos/oauth/*, /api/pos/connections/*
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

  if (urlPath.includes("/oauth/square/start")) return { route: "oauth-square-start" };
  if (urlPath.includes("/oauth/callback/square")) return { route: "oauth-square-callback" };
  if (urlPath.includes("/oauth/yoco/connect")) return { route: "oauth-yoco-connect" };
  if (urlPath.includes("/oauth/status")) return { route: "oauth-status" };

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
  if (urlPath.includes("/receipt/email")) {
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
    return { route: "connection-by-id", parts: ["connections", connectionMatch[1]], id: connectionMatch[1] };
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

  if (resolved.route === "sales") {
    if (req.method === "GET") return handlePosSalesList(req, res);
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "sale-audit") {
    req.params = { ...(req.params || {}), id: String(resolved.id || "").trim() };
    if (req.method === "GET") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
      if (!gate.ok) return gate.response;
      return handlePosSaleAudit(req, res, gate);
    }
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "catalog") {
    if (req.method === "GET") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
      if (!gate.ok) return gate.response;
      return handleNativePosCatalog(req, res, gate);
    }
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "checkout") {
    if (req.method === "POST") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_SELL);
      if (!gate.ok) return gate.response;
      return handleNativePosCheckout(req, res, gate);
    }
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "return") {
    if (req.method === "POST") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_REFUND);
      if (!gate.ok) return gate.response;
      return handleNativePosReturn(req, res, gate);
    }
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "receipt-email") {
    if (req.method === "POST") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
      if (!gate.ok) return gate.response;
      return handlePosReceiptEmail(req, res, gate);
    }
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "invoice") {
    if (req.method === "POST") {
      const gate = await requirePosPermission(req, res, PERMISSIONS.POS_SELL);
      if (!gate.ok) return gate.response;
      return handlePosConvertToInvoice(req, res, gate);
    }
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "registers-list") {
    if (req.method === "GET") return handlePosRegistersList(req, res);
    if (req.method === "POST") return handlePosRegisterCreate(req, res);
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "register-by-id") {
    req.params = { ...(req.params || {}), id: String(resolved.id || "").trim() };
    if (req.method === "PATCH") return handlePosRegisterPatch(req, res);
    if (req.method === "DELETE") return handlePosRegisterDelete(req, res);
    res.setHeader("Allow", "PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "sessions-list") {
    if (req.method === "GET") return handlePosSessionsList(req, res);
    if (req.method === "POST") return handlePosSessionOpen(req, res);
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "session-by-id") {
    req.params = { ...(req.params || {}), id: String(resolved.id || "").trim() };
    if (req.method === "GET") return handlePosSessionGet(req, res);
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "session-close") {
    req.params = { ...(req.params || {}), id: String(resolved.id || "").trim() };
    if (req.method === "POST") return handlePosSessionClose(req, res);
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "connections-list") {
    if (req.method === "GET") return handlePosConnectionsList(req, res);
    if (req.method === "POST") {
      const { requireFeature } = await import("../../server/src/billing/entitlements.js");
      const ok = await requireFeature(req, res, "integrations");
      if (!ok) return;
      return handlePosConnectionCreate(req, res);
    }
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (resolved.route === "connection-by-id") {
    req.params = { ...(req.params || {}), id: String(resolved.id || "").trim() };
    if (req.method === "PATCH" || req.method === "DELETE") {
      const { requireFeature } = await import("../../server/src/billing/entitlements.js");
      const ok = await requireFeature(req, res, "integrations");
      if (!ok) return;
    }
    if (req.method === "PATCH") return handlePosConnectionPatch(req, res);
    if (req.method === "DELETE") return handlePosConnectionDelete(req, res);
    res.setHeader("Allow", "PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(404).json({ error: "Not found" });
}
