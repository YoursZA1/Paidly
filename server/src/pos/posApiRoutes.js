import {
  handlePosConnectionsList,
  handlePosConnectionCreate,
  handlePosConnectionPatch,
  handlePosConnectionDelete,
  handlePosSalesList,
  requirePosPermission,
} from "./posConnectionsRoutes.js";
import { PERMISSIONS } from "../companyRouteAccess.js";
import { handlePosWebhook } from "./posWebhookHandler.js";
import {
  handleSquareOAuthStart,
  handleSquareOAuthCallback,
  handleYocoConnect,
  handlePosOAuthStatus,
} from "./posOAuthRoutes.js";
import {
  handleNativePosCatalog,
  handleNativePosCheckout,
  handleNativePosReturn,
} from "./posNativeCheckout.js";
import { handlePosReceiptEmail } from "./posReceiptEmail.js";
import { handlePosConvertToInvoice } from "./posSaleInvoice.js";
import { handlePosSaleAudit } from "./posAudit.js";
import {
  handlePosRegistersList,
  handlePosRegisterCreate,
  handlePosRegisterPatch,
  handlePosRegisterDelete,
} from "./posRegisters.js";
import {
  handlePosSessionsList,
  handlePosSessionOpen,
  handlePosSessionGet,
  handlePosSessionClose,
} from "./posRegisterSessions.js";

/**
 * Mirror Vercel `api/pos/[[...path]].js` for Vite dev proxy (server/src/index.js).
 */
export function registerPosRoutes(app) {
  app.get("/api/pos/connections", handlePosConnectionsList);
  app.post("/api/pos/connections", handlePosConnectionCreate);
  app.patch("/api/pos/connections/:id", handlePosConnectionPatch);
  app.delete("/api/pos/connections/:id", handlePosConnectionDelete);

  app.get("/api/pos/sales", handlePosSalesList);
  app.get("/api/pos/sales/:id/audit", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
    if (!gate.ok) return gate.response;
    return handlePosSaleAudit(req, res, gate);
  });
  app.get("/api/pos/catalog", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
    if (!gate.ok) return gate.response;
    return handleNativePosCatalog(req, res, gate);
  });
  app.post("/api/pos/checkout", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_SELL);
    if (!gate.ok) return gate.response;
    return handleNativePosCheckout(req, res, gate);
  });
  app.post("/api/pos/return", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_REFUND);
    if (!gate.ok) return gate.response;
    return handleNativePosReturn(req, res, gate);
  });
  app.post("/api/pos/receipt/email", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_ACCESS);
    if (!gate.ok) return gate.response;
    return handlePosReceiptEmail(req, res, gate);
  });
  app.post("/api/pos/invoice", async (req, res) => {
    const gate = await requirePosPermission(req, res, PERMISSIONS.POS_SELL);
    if (!gate.ok) return gate.response;
    return handlePosConvertToInvoice(req, res, gate);
  });
  app.get("/api/pos/registers", handlePosRegistersList);
  app.post("/api/pos/registers", handlePosRegisterCreate);
  app.patch("/api/pos/registers/:id", handlePosRegisterPatch);
  app.delete("/api/pos/registers/:id", handlePosRegisterDelete);

  app.get("/api/pos/sessions", handlePosSessionsList);
  app.post("/api/pos/sessions", handlePosSessionOpen);
  app.get("/api/pos/sessions/:id", handlePosSessionGet);
  app.post("/api/pos/sessions/:id/close", handlePosSessionClose);

  app.post("/api/pos/webhook/:token", handlePosWebhook);
  app.post("/api/pos/webhook/provider/:provider", handlePosWebhook);

  app.get("/api/pos/oauth/status", handlePosOAuthStatus);
  app.post("/api/pos/oauth/square/start", handleSquareOAuthStart);
  app.get("/api/pos/oauth/callback/square", handleSquareOAuthCallback);
  app.post("/api/pos/oauth/yoco/connect", handleYocoConnect);
}
