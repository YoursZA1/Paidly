import { supabaseAdmin } from "./supabaseAdmin.js";
import { getUserFromRequest } from "./supabaseAuth.js";
import { normalizeRequestBody } from "./validateBody.js";
import {
  loadCompanyMembership,
  companyRoleHasPermission,
  normalizeCompanyRole,
  normalizeJobFunction,
  PERMISSIONS,
  COMPANY_ROLES,
} from "./companyRouteAccess.js";

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function inviteRedirectUrl() {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  return `${String(origin).replace(/\/$/, "")}/AcceptInvite`;
}

async function requireCompanyAdmin(req, res) {
  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) return { ok: false, response: jsonError(res, 401, authErr || "Unauthorized") };

    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) {
      return { ok: false, response: jsonError(res, 403, "No company membership") };
    }
    if (!companyRoleHasPermission(membership.companyRole, PERMISSIONS.MANAGE_EMPLOYEES)) {
      return { ok: false, response: jsonError(res, 403, "Forbidden — company admin required") };
    }
    return { ok: true, user, membership };
  } catch (err) {
    return {
      ok: false,
      response: jsonError(res, 500, err?.message || "Could not verify company membership"),
    };
  }
}

async function upsertCompanyMembership(orgId, userId, role, jobFunction) {
  const dbRole = role === COMPANY_ROLES.ADMIN ? "admin" : role;
  const payload = {
    org_id: orgId,
    user_id: userId,
    role: dbRole,
    job_function: jobFunction,
  };

  let result = await supabaseAdmin.from("memberships").upsert(payload, { onConflict: "org_id,user_id" });
  if (result.error && /job_function/i.test(result.error.message || "")) {
    const { job_function: _omit, ...withoutJobFunction } = payload;
    result = await supabaseAdmin.from("memberships").upsert(withoutJobFunction, {
      onConflict: "org_id,user_id",
    });
  }
  return result;
}

/**
 * POST /api/company/team/invite
 */
export async function handleCompanyTeamInvite(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requireCompanyAdmin(req, res);
    if (!gate.ok) return gate.response;

    const body = normalizeRequestBody(req);
    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    const fullName = String(body.full_name || body.fullName || "").trim();
    const role = normalizeCompanyRole(body.role);
    const jobFunction = normalizeJobFunction(body.job_function ?? body.jobFunction ?? "general");

    if (!email) return jsonError(res, 400, "Email is required");

    const { data: existingProfile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", email)
      .maybeSingle();

    if (profileErr) {
      return jsonError(res, 500, profileErr.message || "Could not look up user");
    }

    if (existingProfile?.id) {
      if (existingProfile.id === gate.user.id) {
        return jsonError(res, 400, "You cannot invite yourself");
      }
      const { error: memErr } = await upsertCompanyMembership(
        gate.membership.companyId,
        existingProfile.id,
        role,
        jobFunction
      );
      if (memErr) return jsonError(res, 500, memErr.message || "Could not add member");
      return res.status(200).json({
        ok: true,
        mode: "existing_user",
        user_id: existingProfile.id,
        email,
        role,
        job_function: jobFunction,
      });
    }

    const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: fullName || email.split("@")[0],
          company_org_id: gate.membership.companyId,
          company_role: role,
          company_job_function: jobFunction,
          plan: "none",
        },
        redirectTo: inviteRedirectUrl(),
      }
    );

    if (inviteErr) {
      const msg = inviteErr.message || "Invite failed";
      const status = /already|registered|exists|invalid/i.test(msg) ? 400 : 500;
      return jsonError(res, status, msg);
    }

    return res.status(200).json({
      ok: true,
      mode: "email_invite",
      email,
      role,
      job_function: jobFunction,
      user_id: inviteData?.user?.id || null,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Invite failed");
  }
}

/**
 * PATCH /api/company/team/role
 */
export async function handleCompanyTeamRolePatch(req, res) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requireCompanyAdmin(req, res);
    if (!gate.ok) return gate.response;

    const body = normalizeRequestBody(req);
    const userId = String(body.user_id || "").trim();
    const roleRaw = body.role;
    const jobFunctionRaw = body.job_function ?? body.jobFunction;

    if (!userId) return jsonError(res, 400, "user_id is required");
    if (userId === gate.user.id) {
      return jsonError(res, 400, "You cannot change your own role here");
    }

    const patch = {};
    if (roleRaw != null && String(roleRaw).trim() !== "") {
      const role = normalizeCompanyRole(roleRaw);
      patch.role = role === COMPANY_ROLES.ADMIN ? "admin" : role;
    }
    if (jobFunctionRaw != null && String(jobFunctionRaw).trim() !== "") {
      patch.job_function = normalizeJobFunction(jobFunctionRaw);
    }
    if (!Object.keys(patch).length) {
      return jsonError(res, 400, "role or job_function is required");
    }

    let { error } = await supabaseAdmin
      .from("memberships")
      .update(patch)
      .eq("org_id", gate.membership.companyId)
      .eq("user_id", userId);

    if (error && patch.job_function && /job_function/i.test(error.message || "")) {
      const { job_function: _omit, ...withoutJobFunction } = patch;
      if (Object.keys(withoutJobFunction).length) {
        ({ error } = await supabaseAdmin
          .from("memberships")
          .update(withoutJobFunction)
          .eq("org_id", gate.membership.companyId)
          .eq("user_id", userId));
      } else {
        error = null;
      }
    }

    if (error) return jsonError(res, 500, error.message || "Could not update member");

    return res.status(200).json({ ok: true, user_id: userId, ...patch });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not update member");
  }
}

/**
 * GET /api/company/context — membership + permissions for client bootstrap.
 */
export async function handleCompanyContextGet(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const { user, error: authErr } = await getUserFromRequest(req);
    if (!user) return jsonError(res, 401, authErr || "Unauthorized");

    const membership = await loadCompanyMembership(supabaseAdmin, user.id);
    if (!membership) return jsonError(res, 403, "No company membership");

    return res.status(200).json({
      company_id: membership.companyId,
      org_id: membership.orgId,
      company_role: membership.companyRole,
      job_function: membership.jobFunction,
      permissions: Object.values(PERMISSIONS).filter((p) =>
        companyRoleHasPermission(membership.companyRole, p)
      ),
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load company context");
  }
}

export function registerCompanyTeamRoutes(app) {
  app.post("/api/company/invite", handleCompanyTeamInvite);
  app.patch("/api/company/role", handleCompanyTeamRolePatch);
  app.get("/api/company/context", handleCompanyContextGet);
  // Legacy paths (bookmarks / older clients)
  app.post("/api/company/team/invite", handleCompanyTeamInvite);
  app.patch("/api/company/team/role", handleCompanyTeamRolePatch);
}
