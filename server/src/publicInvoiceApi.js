import {
  handlePublicInvoiceGet,
  handlePublicInvoiceVerify,
} from "../../api/public-invoice-shared.js";

export function registerPublicInvoiceRoutes(app) {
  app.get("/api/public-invoice", handlePublicInvoiceGet);
  app.post("/api/public-invoice-verify", handlePublicInvoiceVerify);
}
