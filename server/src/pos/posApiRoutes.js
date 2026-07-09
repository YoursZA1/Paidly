import {
  handlePosConnectionsList,
  handlePosConnectionCreate,
  handlePosConnectionPatch,
  handlePosConnectionDelete,
  handlePosSalesList,
} from "./posConnectionsRoutes.js";
import { handlePosWebhook } from "./posWebhookHandler.js";
import {
  handleSquareOAuthStart,
  handleSquareOAuthCallback,
  handleYocoConnect,
  handlePosOAuthStatus,
} from "./posOAuthRoutes.js";

/**
 * Mirror Vercel `api/pos/[[...path]].js` for Vite dev proxy (server/src/index.js).
 */
export function registerPosRoutes(app) {
  app.get("/api/pos/connections", handlePosConnectionsList);
  app.post("/api/pos/connections", handlePosConnectionCreate);
  app.patch("/api/pos/connections/:id", handlePosConnectionPatch);
  app.delete("/api/pos/connections/:id", handlePosConnectionDelete);

  app.get("/api/pos/sales", handlePosSalesList);

  app.post("/api/pos/webhook/:token", handlePosWebhook);
  app.post("/api/pos/webhook/provider/:provider", handlePosWebhook);

  app.get("/api/pos/oauth/status", handlePosOAuthStatus);
  app.post("/api/pos/oauth/square/start", handleSquareOAuthStart);
  app.get("/api/pos/oauth/callback/square", handleSquareOAuthCallback);
  app.post("/api/pos/oauth/yoco/connect", handleYocoConnect);
}
