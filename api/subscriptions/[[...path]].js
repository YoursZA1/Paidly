/**
 * Vercel: /api/subscriptions/create | status | cancel | current | plans | change
 */
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";
import { normalizeRequestBody } from "../../server/src/validateBody.js";
import {
  handleSubscriptionCancel,
  handleSubscriptionChange,
  handleSubscriptionCreate,
  handleSubscriptionCurrent,
  handleSubscriptionPlans,
  handleSubscriptionStatus,
} from "../../server/src/billing/subscriptionApi.js";

function resolveAction(req) {
  const raw = req.query?.path;
  const parts = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
  const head = (parts[0] || "").toLowerCase();
  if (head) return head;

  const urlPath = String(req.url || "").split("?")[0] || "";
  const m = urlPath.match(/\/api\/subscriptions\/([^/?#]+)/i);
  return m ? String(m[1]).toLowerCase() : "";
}

export default async function handler(req, res) {
  applyPaidlyServerlessCors(req, res, {
    methods: "GET, POST, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();

  req.body = normalizeRequestBody(req);
  const action = resolveAction(req);

  if (action === "plans" && req.method === "GET") {
    return handleSubscriptionPlans(req, res);
  }
  if (action === "create" && req.method === "POST") {
    return handleSubscriptionCreate(req, res);
  }
  if (action === "change" && req.method === "POST") {
    return handleSubscriptionChange(req, res);
  }
  if (action === "status" && req.method === "GET") {
    return handleSubscriptionStatus(req, res);
  }
  if (action === "current" && req.method === "GET") {
    return handleSubscriptionCurrent(req, res);
  }
  if (action === "cancel" && req.method === "POST") {
    return handleSubscriptionCancel(req, res);
  }

  if (!action) {
    return res.status(404).json({
      error: "Not found",
      routes: [
        "GET /api/subscriptions/plans",
        "POST /api/subscriptions/create",
        "POST /api/subscriptions/change",
        "GET /api/subscriptions/status",
        "GET /api/subscriptions/current",
        "POST /api/subscriptions/cancel",
      ],
    });
  }

  res.setHeader("Allow", "GET, POST, OPTIONS");
  return res.status(405).json({ error: "Method not allowed" });
}
