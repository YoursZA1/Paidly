import { createClient } from "@supabase/supabase-js";
import { isEmailVerifiedUser } from "../../shared/auth/emailVerification.js";
import { columnMissingFromWriteError, pickOwnProfilePatch } from "./ownProfileWrite.js";

const PROFILE_SAVE_FAILED = "Couldn't save your profile. Sign in again and try once more.";

async function writeCallerProfile(admin, id, patch, isInsert) {
  let attempt = { ...patch };
  for (let i = 0; i < 8; i++) {
    const query = isInsert
      ? admin.from("profiles").insert({ id, ...attempt })
      : admin.from("profiles").update(attempt).eq("id", id);
    const { error } = await query;
    if (!error) return { ok: true };
    if (isInsert && String(error.code || "") === "23505") return { ok: false, duplicate: true };
    const missing = columnMissingFromWriteError(error.message, attempt);
    if (!missing) {
      console.warn("[bootstrap-user] profile write failed:", error.message);
      return { ok: false };
    }
    delete attempt[missing];
  }
  return { ok: false };
}

/**
 * Save the signed-in user's own profile with the service role.
 * Browser inserts fail profiles RLS when the request is not authenticated as that id.
 * Existing rows keep plan, role, and subscription columns unchanged.
 */
async function ensureCallerProfile(admin, user, body) {
  const id = user?.id;
  if (!id) return { ok: false };
  const patch = pickOwnProfilePatch(body);
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (body?.profile_only === true && email && !patch.email) patch.email = email;
  patch.updated_at = new Date().toISOString();

  const { data: existing, error: readErr } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
  if (readErr) {
    console.warn("[bootstrap-user] profile read failed:", readErr.message);
    return { ok: false };
  }

  if (existing?.id) {
    const updated = await writeCallerProfile(admin, id, patch, false);
    return { ok: updated.ok };
  }

  const inserted = await writeCallerProfile(
    admin,
    id,
    { ...patch, plan: "starter", subscription_status: "inactive" },
    true
  );
  if (inserted.duplicate) {
    const updated = await writeCallerProfile(admin, id, patch, false);
    return { ok: updated.ok };
  }
  return { ok: inserted.ok };
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * POST /api/auth/bootstrap-user (and legacy /api/bootstrap-org via rewrite).
 * Validates Bearer JWT, optionally checks body user_id, runs service-role bootstrap_user_organization.
 */
export default async function bootstrapUserOrganizationHandler(req, res) {
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
  if (!isEmailVerifiedUser(authData.user)) {
    return res.status(403).json({ error: "Verify your email to continue.", code: "EMAIL_NOT_VERIFIED" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  const requestedUserId = String(body.user_id || "").trim();
  const userId = authData.user.id;
  if (requestedUserId && requestedUserId !== userId) {
    return res.status(403).json({ error: "User mismatch" });
  }

  const profileOnly = body.profile_only === true;
  if (profileOnly) {
    const profile = await ensureCallerProfile(admin, authData.user, body);
    if (!profile.ok) return res.status(500).json({ error: PROFILE_SAVE_FAILED });
    return res.status(200).json({ ok: true, profile_ok: true, user_id: userId });
  }

  const requestedName = String(body.org_name || "").trim();
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
