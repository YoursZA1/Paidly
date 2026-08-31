import { applyApiCors } from "../../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../../server/src/validateBody.js";
import { handleCustomerPaymentWebhook } from "../../../server/src/payments/paymentIntentRoutes.js";

export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "POST, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }
  req.body = normalizeRequestBody(req);
  const provider = String(req.query?.provider || "").trim();
  req.params = { ...(req.params || {}), provider };
  return handleCustomerPaymentWebhook(req, res);
}
