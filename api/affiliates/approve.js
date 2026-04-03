/**
 * Vercel serverless: POST /api/affiliates/approve (legacy path; prefer POST /api/admin/approve).
 *
 * Auth: Authorization: Bearer <Supabase access_token>
 * Body: { applicationId } | { application_id } | { id }, optional commissionRate | commission_rate
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, optional RESEND_FROM, PUBLIC_APP_ORIGIN / CLIENT_ORIGIN
 */
import { createClient } from "@supabase/supabase-js";
import { applyPaidlyServerlessCors } from "../../server/src/vercelPaidlyCors.js";
import { assertVercelAffiliateModerationAuth } from "../../server/src/vercelAffiliateModerationAuth.js";
import {
  createResendClient,
  parseAffiliateApplicationId,
  parseCommissionFractionFromBody,
  runAffiliateApplicationApprove,
} from "../../server/src/affiliateModerationCore.js";

function cors(res, req) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured (Supabase)" });
  }

  const moderator = await assertVercelAffiliateModerationAuth(supabase, req, res);
  if (!moderator) return;

  const resend = createResendClient();
  if (!resend) {
    return res.status(503).json({ error: "Email service not configured (RESEND_API_KEY)" });
  }

  const applicationId = parseAffiliateApplicationId(req.body || {});
  if (!applicationId) {
    return res.status(400).json({ error: "Missing applicationId" });
  }

  const commissionFraction = parseCommissionFractionFromBody(req.body || {});
  const result = await runAffiliateApplicationApprove(supabase, resend, {
    applicationId,
    commissionFraction,
    httpRequest: req,
  });

  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(200).json(result.payload);
}
