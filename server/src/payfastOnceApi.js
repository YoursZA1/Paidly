/**
 * POST /api/payfast/once — legacy one-time invoice PayFast checkout.
 * DISABLED: customer invoice money uses Payment Engine (document-pay → Ozow).
 * SaaS subscription checkout remains on /api/payfast + /api/subscriptions.
 */
import { applyPaidlyServerlessCors } from "./vercelPaidlyCors.js";

export default async function payfastOnceHandler(req, res) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(410).json({
    error:
      "Legacy PayFast one-time invoice checkout is disabled. Customers pay via the Payment Engine (Ozow).",
    code: "CUSTOMER_PAYFAST_DISABLED",
  });
}
