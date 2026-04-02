/**
 * Vercel serverless: GET /api/security/events
 *
 * In-process snapshot (cold serverless instances show near-empty counts). Same auth as Express admin security route.
 */
import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../server/src/adminRouteAccess.js";
import { getSecurityEventsSnapshot } from "../../server/src/securityMiddleware.js";

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
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
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowInternalTeam: true });
  if (deny) return res.status(deny.status).json(deny.body);

  return res.status(200).json({
    status: "ok",
    area: "security-events",
    at: new Date().toISOString(),
    summary: getSecurityEventsSnapshot(),
  });
}
