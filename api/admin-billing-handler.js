/**
 * Admin billing (Hobby-friendly single function).
 * Rewrites: /api/admin/subscriptions | revenue | failed-payments
 */
import { applyPaidlyServerlessCors } from "../server/src/vercelPaidlyCors.js";
import {
  handleAdminFailedPayments,
  handleAdminRevenue,
  handleAdminSubscriptionsList,
} from "../server/src/billing/adminBillingApi.js";

export default async function handler(req, res) {
  applyPaidlyServerlessCors(req, res, {
    methods: "GET, OPTIONS",
    headers: "Content-Type, Authorization",
  });
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const route = String(req.query.__ab || "").trim().toLowerCase();
  if (route === "subscriptions") return handleAdminSubscriptionsList(req, res);
  if (route === "revenue") return handleAdminRevenue(req, res);
  if (route === "failed-payments" || route === "failed_payments") {
    return handleAdminFailedPayments(req, res);
  }

  return res.status(404).json({
    error: "Not found",
    routes: [
      "GET /api/admin/subscriptions",
      "GET /api/admin/revenue",
      "GET /api/admin/failed-payments",
    ],
  });
}
