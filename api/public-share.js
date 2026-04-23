/**
 * Public invoice/payslip by share token — single Vercel function (Hobby plan).
 * Original paths preserved via vercel.json rewrites → ?doc=&op=
 */
import { handlePublicInvoiceGet, handlePublicInvoiceVerify } from "./_publicInvoiceShared.js";
import { handlePublicPayslipGet, handlePublicPayslipVerify } from "./_publicPayslipShared.js";
import { handlePublicQuoteGet } from "./_publicQuoteShared.js";

export default async function handler(req, res) {
  const doc = String(req.query.doc || "");
  const op = String(req.query.op || "");

  if (doc === "invoice" && op === "get") return handlePublicInvoiceGet(req, res);
  if (doc === "invoice" && op === "verify") return handlePublicInvoiceVerify(req, res);
  if (doc === "quote" && op === "get") return handlePublicQuoteGet(req, res);
  if (doc === "payslip" && op === "get") return handlePublicPayslipGet(req, res);
  if (doc === "payslip" && op === "verify") return handlePublicPayslipVerify(req, res);

  return res.status(404).json({ error: "Not found" });
}
