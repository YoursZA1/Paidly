/**
 * POST /api/admin/decline — Vercel serverless (mounted from api/admin/[resource].js).
 */
import { createClient } from "@supabase/supabase-js";
import { applyPaidlyServerlessCors } from "./vercelPaidlyCors.js";
import { assertVercelAffiliateModerationAuth } from "./vercelAffiliateModerationAuth.js";
import { parseAffiliateApplicationId, runAffiliateApplicationDecline } from "./affiliateModerationCore.js";

function cors(res, req) {
  applyPaidlyServerlessCors(req, res, { methods: "POST, OPTIONS" });
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function handleVercelAffiliateDeclinePost(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

  const moderator = await assertVercelAffiliateModerationAuth(supabase, req, res);
  if (!moderator) return;

  const applicationId = parseAffiliateApplicationId(req.body || {});
  if (!applicationId) return res.status(400).json({ error: "Missing applicationId" });

  const result = await runAffiliateApplicationDecline(supabase, applicationId);
  if (!result.ok) {
    return res.status(result.status).json(result.body);
  }
  return res.status(200).json(result.payload);
}
