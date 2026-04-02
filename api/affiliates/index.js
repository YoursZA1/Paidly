/**
 * Vercel serverless: GET /api/affiliates
 *
 * Admin bundle: affiliate_applications (queue) + affiliates (partner rows). Service role — no user_id filter.
 * Auth: Bearer JWT + internal team or JWT app_metadata.role === admin.
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";

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

function countAffiliateApplicationsByStatus(rows) {
  let pending = 0;
  let approved = 0;
  let declined = 0;
  for (const row of rows || []) {
    const s = String(row?.status ?? "").toLowerCase();
    if (s === "pending") pending += 1;
    else if (s === "approved" || s === "accepted") approved += 1;
    else if (s === "declined" || s === "rejected") declined += 1;
  }
  return { pending, approved, declined, total: (rows || []).length };
}

async function canAccessAffiliateAdminBundle(supabase, userId, jwtUser) {
  const jwtRole = String(jwtUser?.app_metadata?.role || "").toLowerCase();
  if (jwtRole === "admin") return true;
  const { data, error } = await supabase
    .from("profiles")
    .select("role, user_role")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  const r = String(data?.role || data?.user_role || "").toLowerCase();
  return r === "admin" || r === "management" || r === "support";
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

  const requesterId = authData.user.id;
  if (!(await canAccessAffiliateAdminBundle(supabase, requesterId, authData.user))) {
    return res.status(403).json({ error: "Access restricted" });
  }

  let limit = 150;
  const q = req.query?.limit;
  if (q != null && String(q).trim() !== "") {
    const n = Number(String(q).trim());
    if (!Number.isInteger(n) || n < 1 || n > 500) {
      return res.status(400).json({ error: "Invalid limit (use integer 1–500)" });
    }
    limit = n;
  }

  const [appsRes, partnersRes] = await Promise.all([
    supabase.from("affiliate_applications").select("*").order("created_at", { ascending: false }).limit(limit),
    supabase.from("affiliates").select("*").order("created_at", { ascending: false }).limit(limit),
  ]);

  if (appsRes.error) {
    return res.status(500).json({ error: appsRes.error.message });
  }

  const applications = appsRes.data || [];
  const partners = partnersRes.error ? [] : partnersRes.data || [];
  const counts = countAffiliateApplicationsByStatus(applications);
  const data = {
    ok: true,
    applications,
    partners,
    counts,
    ...(partnersRes.error ? { partnerError: partnersRes.error.message } : {}),
  };

  console.log(
    `[GET /api/affiliates] applications=${applications.length} partners=${partners.length} pending=${counts.pending}` +
      (partnersRes.error ? ` partner_fetch_error=${partnersRes.error.message}` : "")
  );
  return res.status(200).json(data);
}
