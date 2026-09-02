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
  isPosStaffInviteRequest,
  POS_INVITE_SOURCE,
  POS_JOB_FUNCTION,
} from "../../shared/posStaffInvite.js";
import {
  generatePosTillInviteCode,
  hashPosTillInviteCode,
} from "./pos/posTillInviteCode.js";
import { consumeTillInviteSlot } from "./rateLimit/consumeRateLimit.js";
import { getClientIp } from "./loginIpRateLimit.js";
import {
  companyInviteRedirectUrl,
  sendCompanyTeamInviteEmail,
} from "./companyTeamInviteDelivery.js";
import { companyInviteShareUrl } from "./companyInviteAppUrl.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

const COMPANY_ROLE_LABELS = {
  employee: "Employee",
  manager: "Manager",
  admin: "Admin",
};

const INVITE_TTL_DAYS = 7;
const POS_INVITE_TTL_DAYS = 7;

function generateInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashInviteToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

function inviteTtlDays(posInvite) {
  return posInvite ? POS_INVITE_TTL_DAYS : INVITE_TTL_DAYS;
}

function inviteNotExpired(row) {
  if (!row?.expires_at) return false;
  return new Date(row.expires_at).getTime() > Date.now();
}

function inviteRowIsPos(row) {
  return isPosStaffInviteRequest({
    source: row?.source,
    role: row?.role,
    jobFunction: row?.job_function,
  });
}

function inviteShareLink(tokenOrCode, rowOrSource) {
  const source =
    typeof rowOrSource === "string"
      ? rowOrSource
      : inviteRowIsPos(rowOrSource)
        ? POS_INVITE_SOURCE
        : "company_admin";
  return companyInviteShareUrl(tokenOrCode, { source });
}

function inviteDisplayStatus(row) {
  const status = String(row?.status || "").toLowerCase();
  if (status === "revoked" || row?.revoked_at) return "revoked";
  if (status === "accepted") return "accepted";
  if (status === "expired") return "expired";
  if (status === "pending" && !inviteNotExpired(row)) return "expired";
  return status || "pending";
}

async function logCompanyInviteAudit({
  actor,
  orgId,
  action,
  email,
  inviteId,
  extra = {},
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      category: "company_invite",
      action,
      entity: "company_invites",
      actor_id: actor?.id || null,
      actor_email: actor?.email || null,
      actor_name: actor?.user_metadata?.full_name || actor?.email || null,
      target_label: email || null,
      description: extra.description || action,
      metadata: {
        org_id: orgId || null,
        invite_id: inviteId || null,
        invited_email: email || null,
        ...extra.metadata,
      },
    });
  } catch (err) {
    console.warn("[company/invite] audit_logs insert failed:", err?.message || err);
  }
}

async function markInviteEmailSent(inviteId) {
  if (!inviteId) return;
  const { error } = await supabaseAdmin
    .from("company_invites")
    .update({ email_sent_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error && !/email_sent_at/i.test(error.message || "")) {
    console.warn("[company/invite] email_sent_at update failed:", error.message);
  }
}

async function deliverStoredInviteEmail({
  row,
  inviteLink,
  inviteCode,
  tillName,
  inviterName,
  companyName,
}) {
  const posInvite = inviteRowIsPos(row);
  return sendCompanyTeamInviteEmail({
    to: row.email,
    inviteLink,
    companyName: companyName || "your company",
    inviterName: inviterName || "Your team admin",
    roleLabel: posInvite ? "POS staff" : COMPANY_ROLE_LABELS[row.role] || "team member",
    tillName: posInvite ? tillName : null,
    inviteCode: posInvite ? inviteCode : null,
    posOnly: posInvite,
  });
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
  const posInvite = source === POS_INVITE_SOURCE;
  const ttlDays = inviteTtlDays(posInvite);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  let inviteCode = null;
  let inviteCodeHash = null;
  if (posInvite) {
    inviteCode = generatePosTillInviteCode();
    inviteCodeHash = hashPosTillInviteCode(inviteCode);
  }
  const row = {
    email,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    org_id: orgId,
    token,
    token_hash: hashInviteToken(token),
    status: "pending",
    expires_at: expiresAt,
    created_by: createdBy,
    source,
    job_function: jobFunction,
  };
  if (registerId) row.register_id = registerId;
  if (invitedName) row.invited_name = invitedName;
  if (inviteCodeHash) row.invite_code_hash = inviteCodeHash;

  const optionalColumns = ["token_hash", "email_sent_at", "invite_code_hash", "invited_name", "register_id", "job_function"];

  const tryInsert = async (payload) => {
    const { data, error } = await supabaseAdmin.from("company_invites").insert(payload).select("id").maybeSingle();
    return { id: data?.id || null, error };
  };

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt > 0 && posInvite) {
      inviteCode = generatePosTillInviteCode();
      inviteCodeHash = hashPosTillInviteCode(inviteCode);
      row.invite_code_hash = inviteCodeHash;
      row.token = generateInviteToken();
      row.token_hash = hashInviteToken(row.token);
    }
    const inserted = await tryInsert(row);
    if (!inserted.error) {
      return {
        id: inserted.id,
        token: row.token,
        inviteCode,
        expiresAt,
        inviteLink: inviteShareLink(row.token, source),
      };
    }
    lastError = inserted.error;
    const msg = inserted.error.message || "";
    const code = inserted.error.code || "";
    if (
      posInvite &&
      /invite_code_hash/i.test(msg) &&
      (/duplicate|unique/i.test(msg) || code === "23505")
    ) {
      continue;
    }
    if (/duplicate|unique/i.test(msg) || code === "23505") {
      const { data: existing } = await supabaseAdmin
        .from("company_invites")
        .select("id, token, expires_at, source, job_function, role")
        .eq("org_id", orgId)
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle();
      if (existing?.token) {
        return {
          id: existing.id,
          token: existing.token,
          inviteCode: null,
          expiresAt: existing.expires_at,
          inviteLink: inviteShareLink(existing.token, existing),
        };
      }
    }
    const dropCol = optionalColumns.find((col) => new RegExp(col, "i").test(msg));
    if (dropCol && row[dropCol] !== undefined) {
      delete row[dropCol];
      continue;
    }
    break;
  }

  if (lastError && /register_id/i.test(lastError.message || "")) {
    if (posInvite) {
      throw new Error("Till invites need a database update. Run scripts/apply-native-pos.sql in the Supabase SQL Editor.");
    }
    const { register_id: _omitRegister, invite_code_hash: _omitHash, invited_name: _omitName, token_hash: _omitHash2, ...withoutRegister } = row;
    const inserted = await tryInsert(withoutRegister);
    if (inserted.error) throw new Error(inserted.error.message || "Could not store invite");
    return { id: inserted.id, token: row.token, inviteCode: null, expiresAt, inviteLink: inviteShareLink(row.token, source) };
  }
  throw new Error(lastError?.message || "Could not store invite");
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
    if (!email) return jsonError(res, 400, "Email is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError(res, 400, "Enter a valid email address");
    }

    let role = normalizeCompanyRole(body.role);
    let jobFunction = normalizeJobFunction(body.job_function ?? body.jobFunction ?? "general");
    let registerId = String(body.register_id || body.registerId || "").trim() || null;
    const invitedName = fullName || null;
    const posInvite = isPosStaffInviteRequest({
      source: body.source,
      role,
      jobFunction,
    });
    const source = posInvite ? POS_INVITE_SOURCE : "company_admin";
    if (posInvite) {
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
        posInvite ? registerId : null
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
      await logCompanyInviteAudit({
        actor: gate.user,
        orgId: gate.membership.companyId,
        action: "invitation_accepted",
        email,
        extra: {
          description: "Existing user added to company from invite form",
          metadata: { mode: "existing_user", role, job_function: jobFunction },
        },
      });
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

    const { data: pendingRows, error: pendingErr } = await supabaseAdmin
      .from("company_invites")
      .select(
        "id, email, role, status, token, org_id, source, job_function, register_id, invited_name, expires_at, revoked_at"
      )
      .eq("org_id", gate.membership.companyId)
      .eq("email", email)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(5);

    if (pendingErr) {
      console.warn("[company/invite] pending lookup failed:", pendingErr.message);
    }

    const livePending = (pendingRows || []).find(
      (row) => !row.revoked_at && inviteNotExpired(row)
    );
    const expiredPending = (pendingRows || []).find(
      (row) => !row.revoked_at && !inviteNotExpired(row)
    );

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

    let persistedInvite = null;
    let reused = false;
    let rotated = false;

    if (livePending) {
      reused = true;
      persistedInvite = {
        id: livePending.id,
        token: livePending.token,
        inviteCode: null,
        expiresAt: livePending.expires_at,
        inviteLink: inviteShareLink(livePending.token, livePending),
      };
    } else if (expiredPending) {
      rotated = true;
      persistedInvite = await rotateCompanyInvite(expiredPending, { posInvite, registerId });
    } else {
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
        return jsonError(res, 500, persistErr?.message || "Could not store invitation");
      }
    }

    if (!persistedInvite?.inviteLink) {
      return jsonError(res, 500, "Invitation was created but the share link could not be built");
    }

    tryGenerateAuthInviteLink({
      email,
      fullName,
      orgId: gate.membership.companyId,
      role,
      jobFunction,
    }).catch((err) => {
      console.warn("[company/invite] generateLink skipped:", err?.message || err);
    });

    const emailResult = await deliverStoredInviteEmail({
      row: {
        email,
        role,
        source,
        job_function: jobFunction,
      },
      inviteLink: persistedInvite.inviteLink,
      inviteCode: persistedInvite.inviteCode,
      tillName: registerName,
      inviterName,
      companyName,
    });

    if (emailResult.success === true) {
      await markInviteEmailSent(persistedInvite.id);
    } else {
      console.error("[company/invite] email delivery failed:", emailResult.error, { to: email, inviteId: persistedInvite.id });
    }

    await logCompanyInviteAudit({
      actor: gate.user,
      orgId: gate.membership.companyId,
      action: reused ? "invitation_resent" : rotated ? "invitation_resent" : "invitation_created",
      email,
      inviteId: persistedInvite.id,
      extra: {
        description: reused
          ? "Reused pending invitation"
          : rotated
            ? "Rotated expired invitation"
            : "Invitation created",
        metadata: {
          role,
          job_function: jobFunction,
          source,
          email_sent: emailResult.success === true,
        },
      },
    });
    if (emailResult.success === true) {
      await logCompanyInviteAudit({
        actor: gate.user,
        orgId: gate.membership.companyId,
        action: "invitation_email_sent",
        email,
        inviteId: persistedInvite.id,
        extra: { description: "Invitation email accepted by provider" },
      });
    } else {
      await logCompanyInviteAudit({
        actor: gate.user,
        orgId: gate.membership.companyId,
        action: "invitation_email_failed",
        email,
        inviteId: persistedInvite.id,
        extra: {
          description: "Invitation email was not accepted by provider",
          metadata: { error: emailResult.error || "Email delivery failed" },
        },
      });
    }

    return res.status(200).json({
      ok: true,
      mode: "email_invite",
      id: persistedInvite.id,
      email,
      invited_name: invitedName,
      role,
      job_function: jobFunction,
      source,
      register_id: registerId,
      register_name: registerName,
      invite_link: persistedInvite.inviteLink,
      invite_code: persistedInvite.inviteCode || null,
      expires_at: persistedInvite.expiresAt || null,
      reused,
      rotated,
      email_sent: emailResult.success === true,
      email_error: emailResult.success ? null : emailResult.error || "Email delivery failed",
      pending_exists: reused,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Invite failed");
  }
}

async function rotateCompanyInvite(row, { posInvite, registerId } = {}) {
  const usePos = posInvite || inviteRowIsPos(row);
  const newToken = generateInviteToken();
  const ttlDays = inviteTtlDays(usePos);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const inviteCode = usePos ? generatePosTillInviteCode() : null;
  const patch = {
    token: newToken,
    token_hash: hashInviteToken(newToken),
    status: "pending",
    expires_at: expiresAt,
    revoked_at: null,
    email_sent_at: null,
  };
  if (usePos) patch.invite_code_hash = hashPosTillInviteCode(inviteCode);
  if (registerId) patch.register_id = registerId;

  let { error: updateErr } = await supabaseAdmin.from("company_invites").update(patch).eq("id", row.id);
  if (updateErr && /token_hash|email_sent_at/i.test(updateErr.message || "")) {
    const { token_hash: _omitHash, email_sent_at: _omitSent, ...withoutOptional } = patch;
    ({ error: updateErr } = await supabaseAdmin.from("company_invites").update(withoutOptional).eq("id", row.id));
  }
  if (updateErr) throw new Error(updateErr.message || "Could not refresh invite");

  return {
    id: row.id,
    token: newToken,
    inviteCode,
    expiresAt,
    inviteLink: inviteShareLink(newToken, usePos ? POS_INVITE_SOURCE : row.source),
  };
}

async function tryGenerateAuthInviteLink({ email, fullName, orgId, role, jobFunction }) {
  const onboardingForm = role === COMPANY_ROLES.ADMIN ? "admin" : "member";
  const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      data: {
        full_name: fullName || email.split("@")[0],
        company_org_id: orgId,
        company_role: role,
        company_job_function: jobFunction,
        company_onboarding_form: onboardingForm,
        plan: "none",
        pending_company_invite: "true",
      },
      redirectTo: companyInviteRedirectUrl(),
    },
  });
  if (linkErr) {
    console.warn("[company/invite] auth.admin.generateLink:", linkErr.message);
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
      return res.status(status).json({
        ok: false,
        error: data?.error || "invalid",
        status: data?.status || null,
      });
    }
    return res.status(200).json({
      ok: true,
      email: data.email,
      invited_name: data.invited_name || null,
      company_name: data.company_name,
      org_id: data.org_id || null,
      register_id: data.register_id || null,
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

async function serializeInviteList(res, rows, orgId) {
  const registerIds = [...new Set(rows.map((row) => row.register_id).filter(Boolean))];
  let names = new Map();
  if (registerIds.length) {
    const { data: registers } = await supabaseAdmin
      .from("pos_registers")
      .select("id, name")
      .eq("org_id", orgId)
      .in("id", registerIds);
    names = new Map((registers || []).map((row) => [row.id, row.name]));
  }

  return res.status(200).json({
    ok: true,
    invites: rows.map((row) => {
      const { token, ...rest } = row;
      const displayStatus = inviteDisplayStatus(row);
      const canCopy = displayStatus === "pending" && Boolean(token);
      return {
        ...rest,
        status: displayStatus,
        stored_status: row.status,
        email_sent: Boolean(row.email_sent_at),
        register_name: row.register_id ? names.get(row.register_id) || null : null,
        invite_link: canCopy ? inviteShareLink(token, row) : null,
      };
    }),
  });
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
    const nowIso = new Date().toISOString();
    let query = supabaseAdmin
      .from("company_invites")
      .select(
        "id, email, invited_name, role, status, token, expires_at, created_at, accepted_at, revoked_at, source, job_function, register_id, email_sent_at"
      )
      .eq("org_id", gate.membership.companyId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status === "pending") {
      query = query.eq("status", "pending").is("revoked_at", null).gte("expires_at", nowIso);
    } else if (status === "expired") {
      query = query.or(`status.eq.expired,and(status.eq.pending,expires_at.lt.${nowIso})`);
    } else if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error && /email_sent_at/i.test(error.message || "")) {
      const fallback = await supabaseAdmin
        .from("company_invites")
        .select(
          "id, email, invited_name, role, status, token, expires_at, created_at, accepted_at, revoked_at, source, job_function, register_id"
        )
        .eq("org_id", gate.membership.companyId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (fallback.error) return jsonError(res, 500, fallback.error.message || "Could not load invites");
      return serializeInviteList(res, fallback.data || [], gate.membership.companyId);
    }
    if (error) return jsonError(res, 500, error.message || "Could not load invites");

    return serializeInviteList(res, data || [], gate.membership.companyId);
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
      .select("id, status, email")
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
    await logCompanyInviteAudit({
      actor: gate.user,
      orgId: gate.membership.companyId,
      action: "invitation_revoked",
      email: row.email,
      inviteId,
      extra: { description: "Invitation revoked" },
    });
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
      .select(
        "id, email, role, status, token, org_id, source, job_function, register_id, invited_name, expires_at, revoked_at"
      )
      .eq("id", inviteId)
      .eq("org_id", gate.membership.companyId)
      .maybeSingle();

    if (fetchErr) return jsonError(res, 500, fetchErr.message);
    if (!row) return jsonError(res, 404, "Invite not found");
    if (row.status === "accepted") return jsonError(res, 400, "Invite already accepted");
    if (row.status === "revoked" || row.revoked_at) {
      return jsonError(res, 400, "This invitation was revoked. Create a new invitation.");
    }

    const posInvite = inviteRowIsPos(row);
    const reusable = row.status === "pending" && inviteNotExpired(row);
    let inviteLink;
    let inviteCode = null;
    let expiresAt = row.expires_at;
    let rotated = false;

    if (reusable && row.token) {
      inviteLink = inviteShareLink(row.token, row);
    } else {
      const rotatedInvite = await rotateCompanyInvite(row, { posInvite, registerId: row.register_id });
      inviteLink = rotatedInvite.inviteLink;
      inviteCode = rotatedInvite.inviteCode;
      expiresAt = rotatedInvite.expiresAt;
      rotated = true;
    }

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

    const emailResult = await deliverStoredInviteEmail({
      row,
      inviteLink,
      inviteCode,
      tillName,
      companyName: orgRow?.name || "your company",
      inviterName: "Your team admin",
    });

    if (emailResult.success === true) {
      await markInviteEmailSent(inviteId);
    } else {
      console.error("[company/invite] resend email failed:", emailResult.error, { to: row.email, inviteId });
    }

    await logCompanyInviteAudit({
      actor: gate.user,
      orgId: gate.membership.companyId,
      action: rotated ? "invitation_resent" : "invitation_resent",
      email: row.email,
      inviteId,
      extra: {
        description: rotated ? "Expired invitation rotated and resent" : "Pending invitation resent",
        metadata: { rotated, email_sent: emailResult.success === true },
      },
    });
    await logCompanyInviteAudit({
      actor: gate.user,
      orgId: gate.membership.companyId,
      action: emailResult.success === true ? "invitation_email_sent" : "invitation_email_failed",
      email: row.email,
      inviteId,
      extra: {
        description: emailResult.success === true ? "Invitation email accepted by provider" : "Invitation email failed",
        metadata: emailResult.success === true ? {} : { error: emailResult.error || "Email delivery failed" },
      },
    });

    return res.status(200).json({
      ok: true,
      id: inviteId,
      invite_link: inviteLink,
      invite_code: inviteCode,
      expires_at: expiresAt,
      register_name: tillName,
      invited_name: row.invited_name || null,
      email: row.email,
      role: row.role,
      job_function: row.job_function,
      source: row.source,
      reused: reusable,
      rotated,
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
