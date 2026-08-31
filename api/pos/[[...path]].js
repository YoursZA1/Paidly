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
import { resolvePosRoute } from "../../server/src/pos/posVercelRoute.js";

/**
 * Vercel: one extra segment reaches this file (`/api/pos/registers`).
 * Nested URLs are rewritten in vercel.json (same pattern as /api/company/team/*).
 */

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
