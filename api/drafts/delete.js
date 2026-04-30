import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const admin = adminClient();
  if (!admin) return res.status(503).json({ error: "Server configuration error" });
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  const { data: authData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Unauthorized" });

  const body = req.body || {};
  const userId = String(body.user_id || "");
  const documentType = String(body.document_type || "");
  const draftKey = String(body.draft_key || "default");
  if (!userId || userId !== authData.user.id) return res.status(403).json({ error: "User mismatch" });

  const { error } = await admin
    .from("drafts")
    .delete()
    .eq("user_id", userId)
    .eq("document_type", documentType)
    .eq("draft_key", draftKey);
  if (error) return res.status(500).json({ error: error.message || "Delete failed" });
  return res.status(200).json({ ok: true });
}
