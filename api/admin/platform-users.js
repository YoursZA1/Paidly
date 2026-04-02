/**
 * Vercel serverless: GET /api/admin/platform-users
 *
 * Auth users + profiles merge (same as Express). Auth: Bearer JWT + internal team or JWT admin.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../server/src/adminRouteAccess.js";
import { fetchMergedPlatformUsersForAdmin } from "../../server/src/adminPlatformUsersList.js";

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

  let limit = 500;
  if (req.query?.limit != null && String(req.query.limit).trim() !== "") {
    const n = Number(String(req.query.limit).trim());
    if (!Number.isInteger(n) || n < 1 || n > 2000) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–2000)" });
    }
    limit = n;
  }

  try {
    const { users } = await fetchMergedPlatformUsersForAdmin(supabase, limit);
    console.log(`[GET /api/admin/platform-users] ${users.length} platform users`);
    return res.status(200).json({ users });
  } catch (e) {
    console.error("[GET /api/admin/platform-users]", e?.message || e);
    return res.status(500).json({ error: e?.message || "Failed to list platform users" });
  }
}
