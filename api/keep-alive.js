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
    return res.status(503).json({ error: "Server configuration error (Supabase)" });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  return res.status(200).json({
    ok: true,
    user_id: data.user.id,
    at: new Date().toISOString(),
  });
}
