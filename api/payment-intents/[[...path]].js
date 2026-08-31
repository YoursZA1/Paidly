import { applyApiCors } from "../../server/src/auth/applyApiCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handlePaymentIntentCreate,
  handlePaymentIntentGet,
  handlePaymentProvidersList,
  handleCustomerPaymentWebhook,
} from "../../server/src/payments/paymentIntentRoutes.js";

function firstQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] ?? "").trim();
  if (value == null || value === "") return "";
  return String(value).trim();
}

function pathParts(req) {
  const rewritten = firstQueryValue(req.query?.__pi);
  const provider = firstQueryValue(req.query?.provider);
  let parts;
  if (rewritten) {
    parts = rewritten.split("/").filter(Boolean);
  } else {
    const raw = req.query?.path;
    if (Array.isArray(raw)) {
      parts = raw.flatMap((part) => String(part).split("/")).filter(Boolean);
    } else if (raw != null && raw !== "") {
      parts = String(raw).split("/").filter(Boolean);
    } else {
      const urlPath = String(req.url || "").split("?")[0] || "";
      const rest = urlPath.replace(/^\/api\/payment-intents\/?/i, "");
      parts = rest ? rest.split("/").filter(Boolean) : [];
    }
  }
  if (parts[0] === "webhook-fwd") {
    return provider ? ["webhook", provider] : ["webhook"];
  }
  if (parts[0] === "webhook" && !parts[1] && provider) {
    return ["webhook", provider];
  }
  return parts;
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
