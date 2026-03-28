/**
 * Vercel serverless: GET /api/affiliate/dashboard
 * Also reachable as GET /affiliate/dashboard (see vercel.json rewrite).
 */
import { createClient } from "@supabase/supabase-js";
import { buildAffiliateDashboardPayload } from "../../server/src/affiliateDashboardData.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: "Server misconfigured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) {
    return res.status(401).json({ error: "Invalid token" });
  }

  const payload = await buildAffiliateDashboardPayload(supabase, authData.user.id);
  if (!payload.ok) {
    return res.status(500).json({ error: payload.error || "failed" });
  }

  return res.status(200).json(payload);
}
