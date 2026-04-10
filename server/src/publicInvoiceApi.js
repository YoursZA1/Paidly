import {
  handlePublicInvoiceGet,
  handlePublicInvoiceVerify,
} from "../../api/_publicInvoiceShared.js";

export function registerPublicInvoiceRoutes(app) {
  app.get("/api/public-invoice", handlePublicInvoiceGet);
  app.post("/api/public-invoice-verify", handlePublicInvoiceVerify);
}
