/**
 * Health, keep-alive, dashboard bootstrap, send-email, and drafts (Vercel Hobby ≤12 functions).
 * Rewrites: /api/health → ?op=health, /api/keep-alive → ?op=keep-alive,
 *           /api/dashboard/bootstrap → ?op=dashboard-bootstrap
 *           /api/send-email → ?op=send-email
 *           /api/drafts/get|save|delete → ?op=drafts-get|drafts-save|drafts-delete
 */
import { createClient } from "@supabase/supabase-js";
import dashboardBootstrapHandler from "../server/src/dashboardBootstrapHandler.js";
import sendEmailHandler from "../server/src/sendEmailApi.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function handleDrafts(req, res, draftOp) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = getSupabaseAdmin();
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

  if (draftOp === "get") {
    const { data, error } = await admin
      .from("drafts")
      .select("user_id, document_type, draft_key, form_data, updated_at, version")
      .eq("user_id", userId)
      .eq("document_type", documentType)
      .eq("draft_key", draftKey)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message || "Fetch failed" });
    return res.status(200).json({ ok: true, draft: data || null });
  }

  if (draftOp === "delete") {
    const { error } = await admin
      .from("drafts")
      .delete()
      .eq("user_id", userId)
      .eq("document_type", documentType)
      .eq("draft_key", draftKey);
    if (error) return res.status(500).json({ error: error.message || "Delete failed" });
    return res.status(200).json({ ok: true });
  }

  if (!["invoice", "payslip"].includes(documentType)) {
    return res.status(400).json({ error: "Unsupported document type" });
  }

  const now = new Date().toISOString();
  const row = {
    user_id: userId,
    document_type: documentType,
    draft_key: draftKey,
    form_data: body.form_data || {},
    version: Number(body.version || Date.now()),
    updated_at: now,
  };

  if (body.last_known_updated_at) {
    const { data: existing } = await admin
      .from("drafts")
      .select("updated_at")
      .eq("user_id", userId)
      .eq("document_type", documentType)
      .eq("draft_key", draftKey)
      .maybeSingle();
    const knownTs = Date.parse(String(body.last_known_updated_at));
    const existingTs = existing?.updated_at ? Date.parse(existing.updated_at) : 0;
    if (Number.isFinite(knownTs) && existingTs > knownTs) {
      return res.status(409).json({ error: "Newer draft exists", code: "STALE_DRAFT_WRITE" });
    }
  }

  const { data, error } = await admin
    .from("drafts")
    .upsert(row, { onConflict: "user_id,document_type,draft_key" })
    .select("updated_at")
    .single();
  if (error) {
    return res.status(500).json({ error: error.message || "Save failed", code: error.code || null });
  }

  await admin.from("draft_versions").insert({
    user_id: userId,
    document_type: documentType,
    draft_key: draftKey,
    form_data: body.form_data || {},
    version: Number(body.version || Date.now()),
    created_at: now,
  });

  return res.status(200).json({ ok: true, updated_at: data?.updated_at || now });
}

export default async function handler(req, res) {
  const op = String(req.query?.op || "").trim();

  if (op === "health") {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    return res.status(200).json({ status: "ok", time: Date.now() });
  }

  if (op === "dashboard-bootstrap") {
    return dashboardBootstrapHandler(req, res);
  }

  if (op === "send-email") {
    return sendEmailHandler(req, res);
  }

  if (op === "drafts-get") return handleDrafts(req, res, "get");
  if (op === "drafts-save") return handleDrafts(req, res, "save");
  if (op === "drafts-delete") return handleDrafts(req, res, "delete");

  if (op === "keep-alive") {
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

  return res.status(400).json({ error: "Missing or invalid op" });
}
