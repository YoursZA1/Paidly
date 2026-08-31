/**
 * POST /api/admin/invite-company — platform admin invites company admins or employees.
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { getUserFromRequest } from "./supabaseAuth.js";
import { normalizeRequestBody } from "./validateBody.js";
import { dashboardRoleFromProfileRow, jwtKnownStaffRole } from "./adminRouteAccess.js";
import {
  normalizeCompanyRole,
  normalizeJobFunction,
  COMPANY_ROLES,
} from "./companyRouteAccess.js";
import {
  companyInviteRedirectUrl,
  sendCompanyTeamInviteEmail,
} from "./companyTeamInviteDelivery.js";
import { companyInviteShareUrl } from "./companyInviteAppUrl.js";

const INVITE_TTL_DAYS = 7;
const COMPANY_ROLE_LABELS = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function companyInviteAppUrl(token) {
  return companyInviteShareUrl(token, { source: "company_admin" });
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function requirePlatformAdmin(req, res) {
  const { user, error: authErr } = await getUserFromRequest(req);
  if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

  if (jwtKnownStaffRole(user) === "admin") return { ok: true, user };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("role, user_role")
    .eq("id", user.id)
    .maybeSingle();

  if (dashboardRoleFromProfileRow(profile) !== "admin") {
    return { ok: false, response: jsonError(res, 403, "Platform admin required") };
  }
  return { ok: true, user };
}

async function persistCompanyInvite({
  orgId,
  email,
  role,
  createdBy,
  source = "platform_admin",
  transferOwnership = false,
}) {
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("company_invites").insert({
    email,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    org_id: orgId,
    token,
    status: "pending",
    expires_at: expiresAt,
    created_by: createdBy,
    source,
    transfer_org_ownership: transferOwnership === true,
  });
  if (error) throw new Error(error.message || "Could not store invite");
  return { token, expiresAt, inviteLink: companyInviteAppUrl(token) };
}

/**
 * POST /api/admin/invite-company
 * Body: { email, full_name?, company_id?, company_name?, role? }
 */
export async function handleAdminCompanyInvitePost(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requirePlatformAdmin(req, res);
    if (!gate.ok) return gate.response;

    const body = normalizeRequestBody(req);
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const fullName = String(body.full_name || body.fullName || "").trim();
    const role = normalizeCompanyRole(body.role || COMPANY_ROLES.ADMIN);
    const jobFunction = normalizeJobFunction(body.job_function ?? body.jobFunction ?? "general");

    if (!email) return jsonError(res, 400, "Email is required");

    let orgId = String(body.company_id || body.org_id || "").trim() || null;
    const companyName = String(body.company_name || body.companyName || "").trim();
    let transferOwnership = false;

    if (!orgId) {
      if (!companyName) {
        return jsonError(res, 400, "company_id or company_name is required");
      }
      const { data: orgRow, error: orgErr } = await supabaseAdmin
        .from("organizations")
        .insert({ name: companyName, owner_id: gate.user.id })
        .select("id")
        .single();
      if (orgErr) return jsonError(res, 500, orgErr.message || "Could not create company");
      orgId = orgRow.id;
      transferOwnership = true;
    } else {
      const { data: existingOrg, error: orgLookupErr } = await supabaseAdmin
        .from("organizations")
        .select("id, name")
        .eq("id", orgId)
        .maybeSingle();
      if (orgLookupErr || !existingOrg) {
        return jsonError(res, 404, "Company not found");
      }
    }

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile?.id) {
      const dbRole = role === COMPANY_ROLES.ADMIN ? "admin" : role;
      await supabaseAdmin.from("memberships").upsert(
        {
          org_id: orgId,
          user_id: existingProfile.id,
          role: transferOwnership && role === COMPANY_ROLES.ADMIN ? "owner" : dbRole,
          job_function: jobFunction,
        },
        { onConflict: "org_id,user_id" }
      );
      if (transferOwnership && role === COMPANY_ROLES.ADMIN) {
        await supabaseAdmin.from("organizations").update({ owner_id: existingProfile.id }).eq("id", orgId);
      }
      const onboardingForm = role === COMPANY_ROLES.ADMIN ? "admin" : "member";
      await supabaseAdmin.rpc("upsert_user_company_role", {
        p_user_id: existingProfile.id,
        p_org_id: orgId,
        p_company_role: role,
        p_onboarding_form: onboardingForm,
        p_assigned_by: gate.user.id,
      });
      return res.status(200).json({
        ok: true,
        mode: "existing_user",
        company_id: orgId,
        user_id: existingProfile.id,
        email,
        role,
      });
    }

    const onboardingForm = role === COMPANY_ROLES.ADMIN ? "admin" : "member";
    const inviteMetadata = {
      full_name: fullName || email.split("@")[0],
      company_org_id: orgId,
      company_role: role,
      company_job_function: jobFunction,
      company_onboarding_form: onboardingForm,
      plan: "none",
      invited_by: gate.user.id,
      transfer_org_ownership: transferOwnership ? "true" : "false",
    };

    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        data: inviteMetadata,
        redirectTo: companyInviteRedirectUrl(),
      },
    });

    if (linkErr) {
      const msg = linkErr.message || "Invite failed";
      const status = /already|registered|exists|invalid/i.test(msg) ? 400 : 500;
      return jsonError(res, status, msg);
    }

    const authInviteLink = String(linkData?.properties?.action_link || "").trim();
    if (!authInviteLink) return jsonError(res, 500, "Could not create invite link");

    let persistedInvite = null;
    try {
      persistedInvite = await persistCompanyInvite({
        orgId,
        email,
        role,
        createdBy: gate.user.id,
        source: "platform_admin",
        transferOwnership,
      });
    } catch (persistErr) {
      console.warn("[admin/invite-company] persist failed:", persistErr?.message);
    }

    const { data: orgRow } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .maybeSingle();

    const emailResult = await sendCompanyTeamInviteEmail({
      to: email,
      inviteLink: authInviteLink,
      companyName: orgRow?.name || companyName || "your company",
      inviterName: "Paidly Platform Admin",
      roleLabel: COMPANY_ROLE_LABELS[role] || "team member",
    });

    return res.status(200).json({
      ok: true,
      mode: "email_invite",
      company_id: orgId,
      email,
      role,
      invite_link: persistedInvite?.inviteLink || authInviteLink,
      auth_invite_link: authInviteLink,
      invite_token: persistedInvite?.token || null,
      expires_at: persistedInvite?.expiresAt || null,
      email_sent: emailResult.success === true,
      email_error: emailResult.success ? null : emailResult.error || "Email delivery failed",
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Invite failed");
  }
}

export function registerAdminCompanyInviteRoutes(app) {
  app.post("/api/admin/invite-company", handleAdminCompanyInvitePost);
}
