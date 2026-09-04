import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { getUserFromRequest } from "../supabaseAuth.js";
import { consumeTillInviteSlot } from "../rateLimit/consumeRateLimit.js";
import { getClientIp } from "../loginIpRateLimit.js";
import {
  isPosStaffInviteRequest,
  POS_INVITE_SOURCE,
  POS_JOB_FUNCTION,
} from "../../../shared/posStaffInvite.js";
import { posInvitePublicErrorMessage } from "../../../shared/companyInviteMessages.js";
import { membershipHasPermission, normalizeCompanyRole, normalizeJobFunction } from "../companyRouteAccess.js";
import { hashPosTillInviteCode } from "./posTillInviteCode.js";
import { orgHasPosCapability } from "./posBusinessType.js";
import {
  buildPosAccessCookie,
  clearPosAccessCookie,
  generatePosAccessToken,
  hashPosAccessToken,
  isSecureRequest,
  membershipFromPosAccessRow,
  POS_ACCESS_TTL_SECONDS,
  publicPosAccessView,
  readPosAccessTokenFromRequest,
} from "./posAccessSession.js";

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({ error: message, ...extra });
}

function isMissingAccessSchema(message) {
  return (
    /pos_access_sessions/i.test(String(message || "")) &&
    /schema cache|does not exist|could not find the/i.test(String(message || ""))
  );
}

function emailsMatch(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function inviteIsPos(row) {
  return isPosStaffInviteRequest({
    source: row?.source,
    role: row?.role,
    jobFunction: row?.job_function,
  });
}

function inviteDisplayStatus(row) {
  const status = String(row?.status || "").toLowerCase();
  if (status === "revoked" || row?.revoked_at) return "revoked";
  if (status === "accepted") return "accepted";
  if (status === "expired") return "expired";
  if (status === "pending" && row?.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return "expired";
  }
  return status || "pending";
}

async function findCompanyInviteByToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return { row: null, error: "missing_token" };
  const codeHash = hashPosTillInviteCode(raw);

  let query = supabaseAdmin
    .from("company_invites")
    .select(
      "id, email, invited_name, role, status, token, expires_at, revoked_at, source, job_function, register_id, org_id, accepted_at, accepted_by"
    )
    .eq("token", raw)
    .limit(1)
    .maybeSingle();
  let { data, error } = await query;
  if (error) return { row: null, dbError: error };
  if (data) return { row: data };

  const tokenHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
  const hashedToken = await supabaseAdmin
    .from("company_invites")
    .select(
      "id, email, invited_name, role, status, token, expires_at, revoked_at, source, job_function, register_id, org_id, accepted_at, accepted_by"
    )
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle();
  if (!hashedToken.error && hashedToken.data) return { row: hashedToken.data };

  if (codeHash) {
    const hashed = await supabaseAdmin
      .from("company_invites")
      .select(
        "id, email, invited_name, role, status, token, expires_at, revoked_at, source, job_function, register_id, org_id, accepted_at, accepted_by"
      )
      .eq("invite_code_hash", codeHash)
      .limit(1)
      .maybeSingle();
    if (hashed.error) return { row: null, dbError: hashed.error };
    if (hashed.data) return { row: hashed.data };
  }
  return { row: null, error: "not_found" };
}

async function loadRegister(orgId, registerId) {
  if (!registerId) return null;
  const { data, error } = await supabaseAdmin
    .from("pos_registers")
    .select("id, org_id, name, status")
    .eq("id", registerId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadOrg(orgId) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id, name, business_type")
    .eq("id", orgId)
    .maybeSingle();
  if (error && /business_type/i.test(error.message || "")) {
    const fallback = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .eq("id", orgId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data || null;
  }
  if (error) throw error;
  return data || null;
}

async function findUserIdByEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .ilike("email", normalized)
    .limit(8);
  if (error || !data?.length) return null;
  const match = data.find((row) => emailsMatch(row.email, normalized));
  return match?.id || null;
}

async function upsertPosMembership({ orgId, userId, role, jobFunction, registerId }) {
  const membershipRole = jobFunction === POS_JOB_FUNCTION ? "employee" : role;
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from("memberships")
    .select("id, disabled_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupErr && /disabled_at/i.test(lookupErr.message || "")) {
    const retry = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    if (retry.error) throw retry.error;
    if (retry.data?.id) {
      await supabaseAdmin
        .from("memberships")
        .update({
          role: membershipRole,
          job_function: jobFunction,
          pos_register_id: jobFunction === POS_JOB_FUNCTION ? registerId : undefined,
        })
        .eq("id", retry.data.id);
      return { ok: true, disabled: false };
    }
  } else if (lookupErr) {
    throw lookupErr;
  }

  if (existing?.disabled_at) {
    return { ok: false, error: "disabled" };
  }

  if (existing?.id) {
    const patch = {
      role: membershipRole,
      job_function: jobFunction,
    };
    if (jobFunction === POS_JOB_FUNCTION && registerId) patch.pos_register_id = registerId;
    const { error } = await supabaseAdmin.from("memberships").update(patch).eq("id", existing.id);
    if (error) throw error;
    return { ok: true, disabled: false };
  }

  const { error } = await supabaseAdmin.from("memberships").insert({
    org_id: orgId,
    user_id: userId,
    role: membershipRole,
    job_function: jobFunction,
    pos_register_id: jobFunction === POS_JOB_FUNCTION ? registerId : null,
  });
  if (error) throw error;
  return { ok: true, disabled: false };
}

async function loadOpenShift(orgId, registerId) {
  if (!orgId || !registerId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from("pos_register_sessions")
      .select("id, org_id, register_id, status, opened_at")
      .eq("org_id", orgId)
      .eq("register_id", registerId)
      .eq("status", "open")
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

async function decorateAccessRow(row) {
  const org = await loadOrg(row.org_id);
  const register = row.register_id ? await loadRegister(row.org_id, row.register_id) : null;
  const openShift = register?.id ? await loadOpenShift(row.org_id, register.id) : null;
  return publicPosAccessView(row, {
    orgName: org?.name || null,
    businessType: org?.business_type ?? null,
    register,
    openShift: openShift
      ? {
          id: openShift.id,
          status: openShift.status,
          register_id: openShift.register_id,
          opened_at: openShift.opened_at,
        }
      : null,
  });
}

async function loadValidPosAccessRow(token) {
  const raw = String(token || "").trim();
  if (!raw) return { error: "missing_token", status: 401 };
  const tokenHash = hashPosAccessToken(raw);
  const { data, error } = await supabaseAdmin
    .from("pos_access_sessions")
    .select(
      "id, org_id, invite_id, register_id, user_id, employee_email, employee_name, role, job_function, token_hash, issued_at, expires_at, revoked_at"
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) {
    if (isMissingAccessSchema(error.message)) {
      return { error: "POS access needs a database update.", status: 503, code: "POS_ACCESS_SCHEMA" };
    }
    return { error: error.message || "Could not load POS access", status: 500 };
  }
  if (!data) return { error: "POS access required", status: 401, code: "POS_ACCESS_REQUIRED" };
  if (data.revoked_at) return { error: "POS access is no longer valid", status: 401, code: "POS_ACCESS_REVOKED" };
  if (new Date(data.expires_at).getTime() <= Date.now()) {
    return { error: "POS access has expired", status: 401, code: "POS_ACCESS_EXPIRED" };
  }
  if (data.register_id) {
    const register = await loadRegister(data.org_id, data.register_id);
    if (!register || register.status !== "active") {
      return { error: "This till is not available", status: 403, code: "REGISTER_DISABLED" };
    }
  }
  if (data.user_id) {
    const { data: membership, error: memErr } = await supabaseAdmin
      .from("memberships")
      .select("id, disabled_at, job_function, role, pos_register_id")
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!memErr && membership?.disabled_at) {
      return { error: "POS access is no longer valid", status: 403, code: "POS_ACCESS_REVOKED" };
    }
  }
  const posOn = await orgHasPosCapability(data.org_id);
  if (!posOn) {
    return { error: "POS is not enabled for this business type.", status: 403, code: "POS_NOT_ENABLED" };
  }
  return { row: data };
}

function applyAccessCookie(req, res, token) {
  res.setHeader("Set-Cookie", buildPosAccessCookie(token, { secure: isSecureRequest(req) }));
}

function clearAccessCookie(req, res) {
  res.setHeader("Set-Cookie", clearPosAccessCookie({ secure: isSecureRequest(req) }));
}

/**
 * Resolve a POS access-pass session from cookie or Bearer pos.<token>.
 * Does not create Auth. Callers must still enforce POS permissions.
 */
export async function resolvePosAccessGate(req) {
  const token = readPosAccessTokenFromRequest(req);
  if (!token) return { ok: false };
  const loaded = await loadValidPosAccessRow(token);
  if (!loaded.row) {
    return {
      ok: false,
      invalid: true,
      status: loaded.status || 401,
      error: loaded.error,
      code: loaded.code,
    };
  }
  const membership = membershipFromPosAccessRow(loaded.row);
  const user = {
    id: loaded.row.user_id || null,
    email: loaded.row.employee_email || null,
    user_metadata: { full_name: loaded.row.employee_name || null },
  };
  try {
    await supabaseAdmin
      .from("pos_access_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", loaded.row.id);
  } catch {
    /* non-fatal */
  }
  return {
    ok: true,
    posAccess: true,
    user,
    membership,
    session: loaded.row,
  };
}

function posActivateFailure(res, code, httpStatus = 400) {
  return res.status(httpStatus).json({
    ok: false,
    error: code,
    message: posInvitePublicErrorMessage(code),
  });
}

/**
 * POST /api/pos/invite-activate — consume a POS invite into a scoped POS session.
 */
export async function handlePosInviteActivate(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Method not allowed");
  }

  try {
    const limited = await consumeTillInviteSlot(getClientIp(req));
    if (!limited.ok) {
      res.setHeader("Retry-After", String(limited.retryAfterSeconds || 60));
      return jsonError(res, 429, "Too many invite attempts. Try again later.", {
        code: "RATE_LIMITED",
        retry_after_seconds: limited.retryAfterSeconds,
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const token = String(body.token || body.code || "").trim();
    if (!token) return posActivateFailure(res, "missing_token");

    const found = await findCompanyInviteByToken(token);
    if (found.dbError) return jsonError(res, 500, found.dbError.message || "Could not validate invite");
    if (!found.row) return posActivateFailure(res, found.error || "not_found", 404);
    if (!inviteIsPos(found.row)) {
      return jsonError(res, 400, "This invitation is not a POS access pass.", { code: "NOT_POS_INVITE" });
    }

    const status = inviteDisplayStatus(found.row);
    if (status === "revoked" || status === "expired" || status !== "pending") {
      return posActivateFailure(res, status === "pending" ? "not_pending" : status, 400);
    }

    const orgId = found.row.org_id;
    const registerId = found.row.register_id;
    if (!registerId) {
      return jsonError(res, 422, "This POS invitation is missing a till.", { code: "REGISTER_REQUIRED" });
    }
    const register = await loadRegister(orgId, registerId);
    if (!register) return jsonError(res, 404, "Register not found", { code: "REGISTER_NOT_FOUND" });
    if (register.org_id !== orgId) return posActivateFailure(res, "not_found", 403);
    if (register.status !== "active") {
      return jsonError(res, 422, "This till is not available", { code: "REGISTER_DISABLED" });
    }
    if (!(await orgHasPosCapability(orgId))) {
      return jsonError(res, 403, "POS is not enabled for this business type.", { code: "POS_NOT_ENABLED" });
    }

    const authHeader = String(req?.headers?.authorization || req?.headers?.Authorization || "");
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
    const { user: authUser } = bearer.toLowerCase().startsWith("pos.")
      ? { user: null }
      : await getUserFromRequest(req);
    const invitedEmail = String(found.row.email || "").trim().toLowerCase();
    if (authUser?.email && invitedEmail && !emailsMatch(authUser.email, invitedEmail)) {
      return posActivateFailure(res, "email_mismatch", 403);
    }

    const role = normalizeCompanyRole(found.row.role || "employee") || "employee";
    const jobFunction =
      String(found.row.source || "").toLowerCase() === POS_INVITE_SOURCE
        ? POS_JOB_FUNCTION
        : normalizeJobFunction(found.row.job_function) || POS_JOB_FUNCTION;

    let userId = authUser?.id || null;
    if (!userId) userId = await findUserIdByEmail(invitedEmail);

    if (userId) {
      const linked = await upsertPosMembership({
        orgId,
        userId,
        role,
        jobFunction,
        registerId,
      });
      if (!linked.ok) return posActivateFailure(res, "revoked", 403);
    }

    const now = new Date();
    const { data: consumed, error: consumeErr } = await supabaseAdmin
      .from("company_invites")
      .update({
        status: "accepted",
        accepted_at: now.toISOString(),
        accepted_by: userId || null,
      })
      .eq("id", found.row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (consumeErr) return jsonError(res, 500, consumeErr.message || "Could not accept invite");
    if (!consumed?.id) return posActivateFailure(res, "not_pending");

    const accessToken = generatePosAccessToken();
    const expiresAt = new Date(now.getTime() + POS_ACCESS_TTL_SECONDS * 1000).toISOString();
    const { data: sessionRow, error: insertErr } = await supabaseAdmin
      .from("pos_access_sessions")
      .insert({
        org_id: orgId,
        invite_id: found.row.id,
        register_id: registerId,
        user_id: userId || null,
        employee_email: invitedEmail || null,
        employee_name: found.row.invited_name || null,
        role: jobFunction === POS_JOB_FUNCTION ? "employee" : role,
        job_function: jobFunction,
        token_hash: hashPosAccessToken(accessToken),
        issued_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select(
        "id, org_id, invite_id, register_id, user_id, employee_email, employee_name, role, job_function, issued_at, expires_at, revoked_at"
      )
      .single();

    if (insertErr) {
      if (isMissingAccessSchema(insertErr.message)) {
        return jsonError(
          res,
          503,
          "POS access needs a database update. Run supabase/migrations/20260904120000_pos_access_sessions.sql in the Supabase SQL Editor.",
          { code: "POS_ACCESS_SCHEMA" }
        );
      }
      return jsonError(res, 500, insertErr.message || "Could not create POS access");
    }

    applyAccessCookie(req, res, accessToken);
    const access = await decorateAccessRow(sessionRow);
    return res.status(200).json({
      ...access,
      access_token: accessToken,
    });
  } catch (err) {
    return jsonError(res, 500, err?.message || "Could not activate POS access");
  }
}

/**
 * GET /api/pos/access — current POS access-pass session (cookie or Bearer pos.).
 */
export async function handlePosAccessGet(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return jsonError(res, 405, "Method not allowed");
  }
  try {
    const gate = await resolvePosAccessGate(req);
    if (!gate.ok) {
      if (gate.invalid) {
        return jsonError(res, gate.status || 401, gate.error || "POS access required", {
          code: gate.code || "POS_ACCESS_REQUIRED",
        });
      }
      return jsonError(res, 401, "POS access required", { code: "POS_ACCESS_REQUIRED" });
    }
    const access = await decorateAccessRow(gate.session);
    return res.status(200).json(access);
  } catch (err) {
    if (isMissingAccessSchema(err?.message)) {
      return jsonError(res, 503, "POS access needs a database update.", { code: "POS_ACCESS_SCHEMA" });
    }
    return jsonError(res, 500, err?.message || "Could not load POS access");
  }
}

/**
 * POST /api/pos/access-end — revoke the current POS access-pass session.
 */
export async function handlePosAccessEnd(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return jsonError(res, 405, "Method not allowed");
  }
  try {
    const token = readPosAccessTokenFromRequest(req);
    if (token) {
      await supabaseAdmin
        .from("pos_access_sessions")
        .update({ revoked_at: new Date().toISOString() })
        .eq("token_hash", hashPosAccessToken(token))
        .is("revoked_at", null);
    }
    clearAccessCookie(req, res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    clearAccessCookie(req, res);
    return res.status(200).json({ ok: true });
  }
}

export function posGateHasPermission(gate, permission) {
  if (!gate?.membership) return false;
  return membershipHasPermission(gate.membership, permission);
}
