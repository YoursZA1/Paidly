import crypto from "node:crypto";
import { supabaseAdmin } from "./supabaseAdmin.js";
import { getUserFromRequest } from "./supabaseAuth.js";
import { normalizeRequestBody } from "./validateBody.js";
import {
  loadCompanyMembership,
  companyRoleHasPermission,
  membershipHasPermission,
  normalizeCompanyRole,
  normalizeJobFunction,
  PERMISSIONS,
  COMPANY_ROLES,
} from "./companyRouteAccess.js";
import {
  isPosOnlyStaff,
  POS_INVITE_SOURCE,
  POS_JOB_FUNCTION,
  posInvitePath,
} from "../../shared/posStaffInvite.js";
import {
  formatPosTillInviteCode,
  generatePosTillInviteCode,
  hashPosTillInviteCode,
} from "./pos/posTillInviteCode.js";
import { consumeTillInviteSlot } from "./rateLimit/consumeRateLimit.js";
import { getClientIp } from "./loginIpRateLimit.js";
import {
  companyInviteRedirectUrl,
  sendCompanyTeamInviteEmail,
} from "./companyTeamInviteDelivery.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

const INVITE_TTL_DAYS = 14;
const POS_INVITE_TTL_DAYS = 7;

function companyInviteAppUrl(tokenOrCode, { source } = {}) {
  const origin =
    (process.env.CLIENT_ORIGIN && String(process.env.CLIENT_ORIGIN).split(",")[0]?.trim()) ||
    process.env.VITE_APP_URL ||
    process.env.APP_URL ||
    "https://www.paidly.co.za";
  const base = String(origin).replace(/\/$/, "");
  if (source === POS_INVITE_SOURCE) {
    return posInvitePath(formatPosTillInviteCode(tokenOrCode) || tokenOrCode, base);
  }
  return `${base}/invite?token=${encodeURIComponent(tokenOrCode)}`;
}

function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function persistCompanyInvite({
  orgId,
  email,
  role,
  createdBy,
  source = "company_admin",
  jobFunction = "general",
  registerId = null,
  invitedName = null,
}) {
  const token = generateInviteToken();
  const ttlDays = source === POS_INVITE_SOURCE ? POS_INVITE_TTL_DAYS : INVITE_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  let inviteCode = null;
  let inviteCodeHash = null;
  if (source === POS_INVITE_SOURCE) {
    inviteCode = generatePosTillInviteCode();
    inviteCodeHash = hashPosTillInviteCode(inviteCode);
  }
  const row = {
    email,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    org_id: orgId,
    token,
    status: "pending",
    expires_at: expiresAt,
    created_by: createdBy,
    source,
    job_function: jobFunction,
  };
  if (registerId) row.register_id = registerId;
  if (invitedName) row.invited_name = invitedName;
  if (inviteCodeHash) row.invite_code_hash = inviteCodeHash;

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0 && source === POS_INVITE_SOURCE) {
      inviteCode = generatePosTillInviteCode();
      inviteCodeHash = hashPosTillInviteCode(inviteCode);
      row.invite_code_hash = inviteCodeHash;
      row.token = generateInviteToken();
    }
    const { error } = await supabaseAdmin.from("company_invites").insert(row);
    if (!error) {
      const linkToken = source === POS_INVITE_SOURCE ? inviteCode : token;
      return {
        token,
        inviteCode,
        expiresAt,
        inviteLink: companyInviteAppUrl(linkToken, { source }),
      };
    }
    lastError = error;
    if (error && /invite_code_hash/i.test(error.message || "") && source === POS_INVITE_SOURCE) {
      continue;
    }
    break;
  }

  if (lastError && /register_id/i.test(lastError.message || "")) {
    if (source === POS_INVITE_SOURCE) {
      throw new Error("Till invites need a database update. Run scripts/apply-native-pos.sql in the Supabase SQL Editor.");
    }
    const { register_id: _omitRegister, invite_code_hash: _omitHash, invited_name: _omitName, ...withoutRegister } = row;
    const { error } = await supabaseAdmin.from("company_invites").insert(withoutRegister);
    if (error) throw new Error(error.message || "Could not store invite");
    return { token, inviteCode: null, expiresAt, inviteLink: companyInviteAppUrl(token, { source }) };
  }
  if (lastError && /job_function/i.test(lastError.message || "")) {
    const { job_function: _omit, register_id: _omitRegister, invite_code_hash: _omitHash, invited_name: _omitName, ...withoutJobFunction } = row;
    const { error } = await supabaseAdmin.from("company_invites").insert(withoutJobFunction);
    if (error) throw new Error(error.message || "Could not store invite");
    return { token, inviteCode: null, expiresAt, inviteLink: companyInviteAppUrl(token, { source }) };
  }
  throw new Error(lastError?.message || "Could not store invite");
}

const COMPANY_ROLE_LABELS = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

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
    if (isPosOnlyStaff(membership)) {
      return { ok: false, response: jsonError(res, 403, "POS staff cannot manage the rest of Paidly", { code: "POS_SCOPE" }) };
    }
    return { ok: true, user, membership };
  } catch (err) {
    return {
      ok: false,
      response: jsonError(res, 500, err?.message || "Could not verify company membership"),
    };
  }
}

async function upsertCompanyMembership(orgId, userId, role, jobFunction, posRegisterId = null) {
  const dbRole = role === COMPANY_ROLES.ADMIN ? "admin" : role;
  const payload = {
    org_id: orgId,
    user_id: userId,
    role: dbRole,
    job_function: jobFunction,
  };
  if (posRegisterId) payload.pos_register_id = posRegisterId;

  let result = await supabaseAdmin.from("memberships").upsert(payload, { onConflict: "org_id,user_id" });
  if (result.error && /pos_register_id/i.test(result.error.message || "")) {
    const { pos_register_id: _omitTill, ...withoutTill } = payload;
    result = await supabaseAdmin.from("memberships").upsert(withoutTill, {
      onConflict: "org_id,user_id",
    });
  }
  if (result.error && /job_function/i.test(result.error.message || "")) {
    const { job_function: _omit, pos_register_id: _omitTill, ...withoutJobFunction } = payload;
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
    const sourceRaw = String(body.source || "company_admin")
      .trim()
      .toLowerCase();
    const source = sourceRaw === POS_INVITE_SOURCE ? POS_INVITE_SOURCE : "company_admin";
    let role = normalizeCompanyRole(body.role);
    let jobFunction = normalizeJobFunction(body.job_function ?? body.jobFunction ?? "general");
    let registerId = String(body.register_id || body.registerId || "").trim() || null;
    const invitedName = String(body.full_name || body.fullName || "").trim() || null;
    if (source === POS_INVITE_SOURCE) {
      role = COMPANY_ROLES.EMPLOYEE;
      jobFunction = POS_JOB_FUNCTION;
      if (!registerId) {
        return jsonError(res, 422, "Till is required for a POS staff invite", { code: "TILL_REQUIRED" });
      }
    }
    if (registerId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registerId)) {
      return jsonError(res, 422, "Till is invalid");
    }
    let registerName = null;
    if (registerId) {
      const { data: registerRow } = await supabaseAdmin
        .from("pos_registers")
        .select("id, name")
        .eq("id", registerId)
        .eq("org_id", gate.membership.companyId)
        .maybeSingle();
      if (!registerRow?.id) return jsonError(res, 422, "Till was not found for this business");
      registerName = registerRow.name || "Till";
    }

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
        jobFunction,
        source === POS_INVITE_SOURCE ? registerId : null
      );
      if (memErr) return jsonError(res, 500, memErr.message || "Could not add member");
      if (registerId) {
        await supabaseAdmin
          .from("pos_registers")
          .update({ assigned_staff_id: existingProfile.id })
          .eq("id", registerId)
          .eq("org_id", gate.membership.companyId);
      }
      const { error: roleErr } = await supabaseAdmin.rpc("upsert_user_company_role", {
        p_user_id: existingProfile.id,
        p_org_id: gate.membership.companyId,
        p_company_role: role,
        p_onboarding_form: role === COMPANY_ROLES.ADMIN ? "admin" : "member",
        p_assigned_by: gate.user.id,
      });
      if (roleErr) {
        return jsonError(res, 500, roleErr.message || "Could not assign company role");
      }
      return res.status(200).json({
        ok: true,
        mode: "existing_user",
        user_id: existingProfile.id,
        email,
        invited_name: invitedName || existingProfile.full_name || null,
        role,
        job_function: jobFunction,
        register_id: registerId,
        register_name: registerName,
      });
    }

    const onboardingForm = role === COMPANY_ROLES.ADMIN ? "admin" : "member";
    const inviteMetadata = {
      full_name: fullName || email.split("@")[0],
      company_org_id: gate.membership.companyId,
      company_role: role,
      company_job_function: jobFunction,
      company_onboarding_form: onboardingForm,
      plan: "none",
      invited_by: gate.user.id,
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
    if (!authInviteLink) {
      return jsonError(res, 500, "Could not create invite link");
    }

    let persistedInvite = null;
    try {
      persistedInvite = await persistCompanyInvite({
        orgId: gate.membership.companyId,
        email,
        role,
        createdBy: gate.user.id,
        source,
        jobFunction,
        registerId,
        invitedName,
      });
    } catch (persistErr) {
      if (source === POS_INVITE_SOURCE) {
        return jsonError(res, 500, persistErr?.message || "Could not store till invite");
      }
      console.warn("[company/invite] persist company_invites failed:", persistErr?.message);
    }

    const inviteLink = persistedInvite?.inviteLink || authInviteLink;
    const emailInviteLink =
      source === POS_INVITE_SOURCE ? inviteLink : authInviteLink || inviteLink;

    const [{ data: inviterProfile }, { data: orgRow }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", gate.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", gate.membership.companyId)
        .maybeSingle(),
    ]);

    const companyName =
      String(orgRow?.name || inviterProfile?.company_name || "").trim() || "your company";
    const inviterName =
      String(inviterProfile?.full_name || gate.user.user_metadata?.full_name || gate.user.email || "")
        .trim() || "Your team admin";

    const emailResult = await sendCompanyTeamInviteEmail({
      to: email,
      inviteLink: emailInviteLink,
      companyName,
      inviterName,
      roleLabel:
        source === POS_INVITE_SOURCE ? "POS staff" : COMPANY_ROLE_LABELS[role] || "team member",
      tillName: source === POS_INVITE_SOURCE ? registerName : null,
      inviteCode: source === POS_INVITE_SOURCE ? persistedInvite?.inviteCode : null,
      posOnly: source === POS_INVITE_SOURCE,
    });

    return res.status(200).json({
      ok: true,
      mode: "email_invite",
      email,
      invited_name: invitedName,
      role,
      job_function: jobFunction,
      source,
      register_id: registerId,
      register_name: registerName,
      user_id: linkData?.user?.id || null,
      invite_link: inviteLink,
      invite_code: persistedInvite?.inviteCode || null,
      expires_at: persistedInvite?.expiresAt || null,
      email_sent: emailResult.success === true,
      email_error: emailResult.success ? null : emailResult.error || "Email delivery failed",
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
      assigned_register_id: membership.posRegisterId || null,
      scope: isPosOnlyStaff(membership) ? "pos" : "paidly",
      permissions: Object.values(PERMISSIONS).filter((p) => membershipHasPermission(membership, p)),
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load company context");
  }
}

export async function handleCompanyInviteValidate(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const limited = await consumeTillInviteSlot(getClientIp(req));
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSeconds || 60));
      return jsonError(res, 429, "Too many invite code attempts. Try again later.", {
        code: "RATE_LIMITED",
        retry_after_seconds: limited.retryAfterSeconds,
      });
    }

    const token = String(req.query?.token || req.query?.code || "").trim();
    if (!token) return jsonError(res, 400, "token is required");

    const { data, error } = await supabaseAdmin.rpc("validate_company_invite_token", {
      p_token: token,
    });
    if (error) return jsonError(res, 500, error.message || "Validation failed");
    if (!data?.ok) {
      const status = data?.error === "not_found" ? 404 : 400;
      return res.status(status).json({ ok: false, error: data?.error || "invalid" });
    }
    return res.status(200).json({
      ok: true,
      email: data.email,
      invited_name: data.invited_name || null,
      company_name: data.company_name,
      register_name: data.register_name || null,
      role: data.role,
      job_function: data.job_function,
      source: data.source,
      expires_at: data.expires_at,
      pos_only:
        String(data.source || "").toLowerCase() === POS_INVITE_SOURCE ||
        String(data.job_function || "").toLowerCase() === POS_JOB_FUNCTION,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Validation failed");
  }
}

/**
 * GET /api/company/invites — list invites for the caller's company (admin only).
 */
export async function handleCompanyInvitesList(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requireCompanyAdmin(req, res);
    if (!gate.ok) return gate.response;

    const status = String(req.query?.status || "").trim().toLowerCase();
    let query = supabaseAdmin
      .from("company_invites")
      .select(
        "id, email, invited_name, role, status, expires_at, created_at, accepted_at, revoked_at, source, job_function, register_id"
      )
      .eq("org_id", gate.membership.companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return jsonError(res, 500, error.message || "Could not load invites");

    const rows = data || [];
    const registerIds = [...new Set(rows.map((row) => row.register_id).filter(Boolean))];
    let names = new Map();
    if (registerIds.length) {
      const { data: registers } = await supabaseAdmin
        .from("pos_registers")
        .select("id, name")
        .eq("org_id", gate.membership.companyId)
        .in("id", registerIds);
      names = new Map((registers || []).map((row) => [row.id, row.name]));
    }

    return res.status(200).json({
      ok: true,
      invites: rows.map((row) => ({
        ...row,
        register_name: row.register_id ? names.get(row.register_id) || null : null,
      })),
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not load invites");
  }
}

/**
 * DELETE /api/company/invites/:id — revoke a pending invite.
 */
export async function handleCompanyInviteRevoke(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requireCompanyAdmin(req, res);
    if (!gate.ok) return gate.response;

    const inviteId = String(req.params?.id || req.query?.id || "").trim();
    if (!inviteId) return jsonError(res, 400, "invite id is required");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("company_invites")
      .select("id, status")
      .eq("id", inviteId)
      .eq("org_id", gate.membership.companyId)
      .maybeSingle();

    if (fetchErr) return jsonError(res, 500, fetchErr.message);
    if (!row) return jsonError(res, 404, "Invite not found");
    if (row.status !== "pending") return jsonError(res, 400, "Only pending invites can be revoked");

    const { error } = await supabaseAdmin
      .from("company_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", inviteId);

    if (error) return jsonError(res, 500, error.message || "Could not revoke invite");
    return res.status(200).json({ ok: true, id: inviteId, status: "revoked" });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not revoke invite");
  }
}

/**
 * POST /api/company/invites/:id/resend — extend expiry and return fresh share link.
 */
export async function handleCompanyInviteResend(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const gate = await requireCompanyAdmin(req, res);
    if (!gate.ok) return gate.response;

    const inviteId = String(req.params?.id || req.body?.id || "").trim();
    if (!inviteId) return jsonError(res, 400, "invite id is required");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("company_invites")
      .select("id, email, role, status, token, org_id, source, job_function, register_id, invited_name")
      .eq("id", inviteId)
      .eq("org_id", gate.membership.companyId)
      .maybeSingle();

    if (fetchErr) return jsonError(res, 500, fetchErr.message);
    if (!row) return jsonError(res, 404, "Invite not found");
    if (row.status === "accepted") return jsonError(res, 400, "Invite already accepted");

    const posInvite = row.source === POS_INVITE_SOURCE || row.job_function === POS_JOB_FUNCTION;
    const newToken = generateInviteToken();
    const ttlDays = posInvite ? POS_INVITE_TTL_DAYS : INVITE_TTL_DAYS;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
    const inviteCode = posInvite ? generatePosTillInviteCode() : null;
    const patch = {
      token: newToken,
      status: "pending",
      expires_at: expiresAt,
      revoked_at: null,
    };
    if (posInvite) patch.invite_code_hash = hashPosTillInviteCode(inviteCode);

    const { error: updateErr } = await supabaseAdmin
      .from("company_invites")
      .update(patch)
      .eq("id", inviteId);

    if (updateErr) return jsonError(res, 500, updateErr.message || "Could not refresh invite");

    const inviteLink = companyInviteAppUrl(posInvite ? inviteCode : newToken, { source: row.source });
    const { data: orgRow } = await supabaseAdmin
      .from("organizations")
      .select("name")
      .eq("id", row.org_id)
      .maybeSingle();

    let tillName = null;
    if (row.register_id) {
      const { data: registerRow } = await supabaseAdmin
        .from("pos_registers")
        .select("name")
        .eq("id", row.register_id)
        .maybeSingle();
      tillName = registerRow?.name || null;
    }

    const emailResult = await sendCompanyTeamInviteEmail({
      to: row.email,
      inviteLink,
      companyName: orgRow?.name || "your company",
      inviterName: "Your team admin",
      roleLabel: posInvite ? "POS staff" : COMPANY_ROLE_LABELS[row.role] || "team member",
      tillName,
      inviteCode,
      posOnly: posInvite,
    });

    return res.status(200).json({
      ok: true,
      id: inviteId,
      invite_link: inviteLink,
      invite_code: inviteCode,
      expires_at: expiresAt,
      register_name: tillName,
      invited_name: row.invited_name || null,
      email_sent: emailResult.success === true,
      email_error: emailResult.success ? null : emailResult.error || "Email delivery failed",
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not resend invite");
  }
}

export function registerCompanyTeamRoutes(app) {
  app.post("/api/company/invite", handleCompanyTeamInvite);
  app.get("/api/company/invite/validate", handleCompanyInviteValidate);
  app.get("/api/company/invites", handleCompanyInvitesList);
  app.delete("/api/company/invites/:id", handleCompanyInviteRevoke);
  app.post("/api/company/invites/:id/resend", handleCompanyInviteResend);
  app.patch("/api/company/role", handleCompanyTeamRolePatch);
  app.get("/api/company/context", handleCompanyContextGet);
  // Legacy paths (bookmarks / older clients)
  app.post("/api/company/team/invite", handleCompanyTeamInvite);
  app.patch("/api/company/team/role", handleCompanyTeamRolePatch);
}
