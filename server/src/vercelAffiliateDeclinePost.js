/**
 * POST decline affiliate application — shared by Express patterns; used from Vercel admin/[resource].js.
 */
import { createClient } from "@supabase/supabase-js";

function cors(res, req) {
  const origin = req.headers.origin;
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function requireAdmin(supabase, userId) {
  const { data, error } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) return false;
  const r = String(data?.role || "").toLowerCase();
  return r === "admin" || r === "management";
}

export async function handleVercelAffiliateDeclinePost(req, res) {
  cors(res, req);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured (Supabase)" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid or expired token" });

  const jwtRole = String(authData.user?.app_metadata?.role || "").toLowerCase();
  if (jwtRole !== "admin" && !(await requireAdmin(supabase, authData.user.id))) {
    return res.status(403).json({ error: "Access restricted" });
  }

  const applicationId = req.body?.applicationId || req.body?.application_id || req.body?.id;
  if (!applicationId) return res.status(400).json({ error: "Missing applicationId" });

  const { data: appRow, error: appErr } = await supabase
    .from("affiliate_applications")
    .select("id, status")
    .eq("id", applicationId)
    .maybeSingle();

  if (appErr || !appRow) return res.status(404).json({ error: "Application not found" });

  if (String(appRow.status).toLowerCase() !== "pending") {
    return res.status(400).json({ error: "Application is not pending" });
  }

  const { error: upErr } = await supabase
    .from("affiliate_applications")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", applicationId);

  if (upErr) return res.status(500).json({ error: upErr.message });

  return res.status(200).json({ ok: true });
}
