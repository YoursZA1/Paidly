import { handlePublicQuoteGet, handlePublicQuoteDecide } from "../../api/_publicQuoteShared.js";

export function registerPublicQuoteRoutes(app) {
  app.get("/api/public-quote", handlePublicQuoteGet);
  app.post("/api/public-quote/decide", handlePublicQuoteDecide);
}
