import { handlePublicQuoteGet } from "../../api/_publicQuoteShared.js";

export function registerPublicQuoteRoutes(app) {
  app.get("/api/public-quote", handlePublicQuoteGet);
}
