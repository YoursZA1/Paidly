import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handlePaymentIntentCreate,
  handlePaymentIntentGet,
  handlePaymentProvidersList,
  handleCustomerPaymentWebhook,
} from "../../server/src/payments/paymentIntentRoutes.js";

function pathParts(req) {
  const raw = req.query?.path;
  if (Array.isArray(raw)) return raw.flatMap((part) => String(part).split("/")).filter(Boolean);
  if (raw != null && raw !== "") return String(raw).split("/").filter(Boolean);
  const urlPath = String(req.url || "").split("?")[0] || "";
  const rest = urlPath.replace(/^\/api\/payment-intents\/?/i, "");
  return rest ? rest.split("/").filter(Boolean) : [];
}

export default async function handler(req, res) {
  applyApiCors(req, res, {
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();
  req.body = normalizeRequestBody(req);

  const parts = pathParts(req);
  const head = (parts[0] || "").toLowerCase();
  const provider = parts[1] || String(req.query?.provider || "").trim();

  if (head === "webhook") {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      return res.status(405).json({ error: "Method not allowed" });
    }
    req.params = { ...(req.params || {}), provider };
    return handleCustomerPaymentWebhook(req, res);
  }

  if (!head && req.method === "POST") return handlePaymentIntentCreate(req, res);
  if (!head && req.method === "GET") return handlePaymentProvidersList(req, res);
  if (head === "providers" && req.method === "GET") return handlePaymentProvidersList(req, res);
  if (head && req.method === "GET") {
    req.params = { ...(req.params || {}), id: head };
    return handlePaymentIntentGet(req, res);
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "Method not allowed" });
}
