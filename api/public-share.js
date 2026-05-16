/**
 * Public docs, OG images, and email tracking — single Vercel function (Hobby plan).
 * Rewrites: ?doc=invoice|quote|payslip|og|email-track (see vercel.json).
 */
import { handlePublicInvoiceGet, handlePublicInvoiceVerify } from "./_publicInvoiceShared.js";
import { handlePublicPayslipGet, handlePublicPayslipVerify } from "./_publicPayslipShared.js";
import { handlePublicQuoteGet } from "./_publicQuoteShared.js";
import { handleEmailTrack } from "./_emailTrackShared.js";
import renderOgImageHandler from "../server/src/vercelOgImage.js";

export default async function handler(req, res) {
  const doc = String(req.query.doc || "");
  const op = String(req.query.op || "");

  if (doc === "email-track") {
    return handleEmailTrack(req, res);
  }

  if (doc === "og") {
    return renderOgImageHandler(req, res);
  }

  if (doc === "invoice" && op === "get") return handlePublicInvoiceGet(req, res);
  if (doc === "invoice" && op === "verify") return handlePublicInvoiceVerify(req, res);
  if (doc === "quote" && op === "get") return handlePublicQuoteGet(req, res);
  if (doc === "payslip" && op === "get") return handlePublicPayslipGet(req, res);
  if (doc === "payslip" && op === "verify") return handlePublicPayslipVerify(req, res);

  return res.status(404).json({ error: "Not found" });
}
