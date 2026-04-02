/**
 * Vercel serverless: POST /api/admin/invite-user
 * Same contract as Express (server/src/index.js) — service role invite + auth aligned with getAdminFromRequest.
 */
import { createClient } from "@supabase/supabase-js";
import { assertCallerForAdminRoute } from "../../server/src/adminRouteAccess.js";
import { adminInviteBodySchema } from "../../server/src/schemas/mutationSchemas.js";
import { sanitizeInviteMetadata, isSafeHttpUrl } from "../../server/src/inputValidation.js";

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseConfiguredClientOrigins(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  const configured = parseConfiguredClientOrigins(process.env.CLIENT_ORIGIN);
  const allowed = new Set([
    "https://paidly.co.za",
    "https://www.paidly.co.za",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...configured,
  ]);
  res.setHeader("Vary", "Origin");
  if (origin && allowed.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    const requested = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      requested || "content-type, authorization, accept"
    );
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
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

  const deny = await assertCallerForAdminRoute(supabase, authData.user, {
    allowTeamManagement: true,
  });
  if (deny) {
    return res.status(deny.status).json(deny.body);
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const parsed = adminInviteBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    return res.status(400).json({
      error: "Invalid request",
      message: flat.formErrors[0] || "Validation failed",
      details: flat.fieldErrors,
    });
  }

  const normalizedEmail = parsed.data.email;

  if (
    parsed.data.redirect_to != null &&
    String(parsed.data.redirect_to).trim() !== "" &&
    !isSafeHttpUrl(String(parsed.data.redirect_to))
  ) {
    return res.status(400).json({ error: "Invalid redirect URL" });
  }

  const staffInviteRoles = new Set(["management", "sales", "support"]);
  let inviteRole = String(parsed.data.role || "management").trim().toLowerCase();
  if (!staffInviteRoles.has(inviteRole)) inviteRole = "management";

  const meta = sanitizeInviteMetadata(
    parsed.data.full_name,
    inviteRole,
    parsed.data.plan
  );

  const origin =
    (typeof parsed.data.redirect_to === "string" &&
      parsed.data.redirect_to.trim() &&
      isSafeHttpUrl(String(parsed.data.redirect_to).trim())
      ? String(parsed.data.redirect_to).trim()
      : "") ||
    (process.env.CLIENT_ORIGIN &&
      String(process.env.CLIENT_ORIGIN).replace(/\/$/, "")) ||
    "";

  const redirectTo = origin ? `${origin.replace(/\/$/, "")}/Login` : undefined;

  const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
    normalizedEmail,
    {
      data: meta,
      redirectTo,
    }
  );

  if (inviteError) {
    return res.status(400).json({ error: inviteError.message });
  }

  return res.status(200).json({ ok: true, user: data?.user || null });
}
