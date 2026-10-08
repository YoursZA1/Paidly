/**
 * POST /api/admin/users — create a Paidly account from the admin directory.
 * The browser cannot insert another person's profiles row (RLS requires id = auth.uid()).
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assertCallerForAdminRoute } from "./adminRouteAccess.js";
import { apiEmailSchema } from "./schemas/apiBodySchemas.js";
import { applyAdminInviteCors } from "./vercelAdminInviteUserPost.js";
import { pickOwnProfilePatch, columnMissingFromWriteError } from "./ownProfileWrite.js";

const createUserBodySchema = z.object({
  email: apiEmailSchema,
  full_name: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  company_name: z.string().trim().max(200).optional(),
  company_address: z.string().trim().max(500).optional(),
  company_website: z.string().trim().max(500).optional(),
});

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function appOrigin() {
  const raw = process.env.CLIENT_ORIGIN || process.env.PUBLIC_APP_ORIGIN || "https://paidly.co.za";
  return String(raw).split(",")[0].trim().replace(/\/$/, "") || "https://paidly.co.za";
}

async function writeProfile(admin, id, patch, isInsert) {
  let attempt = { ...patch };
  for (let i = 0; i < 8; i++) {
    const query = isInsert
      ? admin.from("profiles").insert({ id, ...attempt })
      : admin.from("profiles").update(attempt).eq("id", id);
    const { error } = await query;
    if (!error) return { ok: true };
    if (isInsert && String(error.code || "") === "23505") return { ok: false, duplicate: true };
    const missing = columnMissingFromWriteError(error.message, attempt);
    if (!missing) return { ok: false, error };
    delete attempt[missing];
  }
  return { ok: false };
}

async function emailSetPasswordLink(to, name, link) {
  try {
    const { renderPaidlyEmail } = await import("./auth/paidlyAuthEmails.js");
    const { sendHtmlEmail } = await import("./sendInvoice.js");
    const html = renderPaidlyEmail({
      title: "Set your Paidly password",
      preheader: "Your Paidly account is ready.",
      heading: "Your Paidly account is ready",
      paragraphs: [
        name ? `Hi ${name},` : "Hi,",
        "An administrator created a Paidly account for you. Set a password to sign in.",
      ],
      cta: { label: "Set password", href: link },
    });
    const result = await sendHtmlEmail(to, "Set your Paidly password", html);
    return result?.success === true;
  } catch (e) {
    console.warn("[admin/users] password email failed:", e?.message || e);
    return false;
  }
}

export async function handleAdminCreatePlatformUser(req, res) {
  applyAdminInviteCors(req, res);
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return res.status(503).json({ error: "Server misconfigured" });

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const { data: authData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !authData?.user?.id) return res.status(401).json({ error: "Invalid token" });

  const deny = await assertCallerForAdminRoute(supabase, authData.user, { allowTeamManagement: true });
  if (deny) return res.status(deny.status).json(deny.body);

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }

  const parsed = createUserBodySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  const email = parsed.data.email;
  const fullName = parsed.data.full_name || "";
  const identity = pickOwnProfilePatch({
    full_name: fullName,
    email,
    phone: parsed.data.phone || "",
    company_name: parsed.data.company_name || "",
    company_address: parsed.data.company_address || "",
    company_website: parsed.data.company_website || "",
  });

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      company_name: identity.company_name || "",
      company_address: identity.company_address || "",
      phone: identity.phone || "",
    },
  });

  if (createErr || !created?.user?.id) {
    const msg = String(createErr?.message || "");
    if (/already|registered|exists/i.test(msg)) {
      return res.status(409).json({ error: "A user with this email already exists." });
    }
    console.warn("[admin/users] createUser failed:", msg);
    return res.status(400).json({ error: "Couldn't create this user. Check the email and try again." });
  }

  const userId = created.user.id;
  const now = new Date().toISOString();
  const patch = { ...identity, updated_at: now };
  const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
  const written = existing?.id
    ? await writeProfile(supabase, userId, patch, false)
    : await writeProfile(
        supabase,
        userId,
        { ...patch, plan: "starter", subscription_status: "inactive" },
        true
      );
  if (written.duplicate) {
    await writeProfile(supabase, userId, patch, false);
  } else if (!written.ok) {
    console.warn("[admin/users] profile write failed:", written.error?.message || written.error);
  }

  let emailSent = false;
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appOrigin()}/ResetPassword` },
  });
  const actionLink = String(linkData?.properties?.action_link || "").trim();
  if (linkErr || !actionLink) {
    console.warn("[admin/users] recovery link skipped:", linkErr?.message || "no link");
  } else {
    emailSent = await emailSetPasswordLink(email, fullName, actionLink);
  }

  return res.status(200).json({
    id: userId,
    email,
    full_name: fullName,
    email_sent: emailSent,
  });
}
