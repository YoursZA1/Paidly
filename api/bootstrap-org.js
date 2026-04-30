import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return res.status(503).json({
      error: "Server configuration error (Supabase)",
      detail: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return res.status(401).json({ error: authError?.message || "Invalid or expired token" });
  }

  const requestedUserId = String(req.body?.user_id || "").trim();
  const userId = authData.user.id;
  if (requestedUserId && requestedUserId !== userId) {
    return res.status(403).json({ error: "User mismatch" });
  }

  const requestedName = String(req.body?.org_name || "").trim();
  const orgName =
    requestedName ||
    String(authData.user.user_metadata?.company_name || authData.user.user_metadata?.full_name || "").trim() ||
    "My Organization";

  const { data, error } = await admin.rpc("bootstrap_user_organization", { p_name: orgName });
  if (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to bootstrap organization",
      code: error.code || null,
    });
  }

  return res.status(200).json({
    ok: true,
    user_id: userId,
    org_id: data || null,
  });
}
