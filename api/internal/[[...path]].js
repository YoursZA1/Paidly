/**
 * Vercel: /api/internal/activate | expire
 * Auth: Bearer CRON_SECRET or INTERNAL_BILLING_SECRET — never from SPA.
 */
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handleInternalActivate,
  handleInternalExpire,
} from "../../server/src/billing/internalBillingApi.js";

function resolveAction(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = (parts[0] || "").toLowerCase();
  if (head) return head;
  const urlPath = String(req.url || "").split("?")[0] || "";
  const m = urlPath.match(/\/api\/internal\/([^/?#]+)/i);
  return m ? String(m[1]).toLowerCase() : "";
}

export default async function handler(req, res) {
  applyPaidlyServerlessCors(req, res, {
    methods: "POST, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  req.body = normalizeRequestBody(req);
  const action = resolveAction(req);

  if (action === "activate") return handleInternalActivate(req, res);
  if (action === "expire") return handleInternalExpire(req, res);

  return res.status(404).json({
    error: "Not found",
    routes: ["POST /api/internal/activate", "POST /api/internal/expire"],
  });
}
