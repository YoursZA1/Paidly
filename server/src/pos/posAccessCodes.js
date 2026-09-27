/**
 * POS operator access codes.
 *
 * A code is a short credential for one employee (memberships.id) that opens a scoped till session
 * (pos_access_sessions) — never a Paidly Auth session and never the dashboard.
 *
 * Security:
 *   - 6 digits, cryptographically random, weak patterns rejected.
 *   - Stored as HMAC-SHA256(server secret, "<org_id>:<code>") — a leaked table cannot be brute-forced
 *     offline without the secret. The plaintext is returned once, at generation.
 *   - Entry needs a till (register id from the till link). The business is derived from that till on
 *     the server, never from the browser. Codes only match inside that business.
 *   - Failed attempts are rate-limited per till and per client.
 *   - Regenerating / revoking a code, or disabling POS access, ends every till session it opened.
 */
import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { isValidUuid } from "../inputValidation.js";
import { orgHasPosCapability } from "./posBusinessType.js";
import { requirePosPlanForOrg } from "./posEntitlement.js";
import {
  buildPosAccessCookie,
  generatePosAccessToken,
  hashPosAccessToken,
  isSecureRequest,
  publicPosAccessView,
} from "./posAccessSession.js";
import { membershipIsPosEnabled, POS_JOB_FUNCTION } from "../../../shared/posStaffInvite.js";

export const POS_ACCESS_CODE_LENGTH = 6;
/** A code session lasts one working shift; Lock POS ends it sooner. */
export const POS_CODE_SESSION_TTL_SECONDS = 14 * 60 * 60;
export const POS_CODE_MAX_FAILURES_PER_TILL = 10;
export const POS_CODE_MAX_FAILURES_PER_CLIENT = 20;
export const POS_CODE_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export const POS_ACCESS_MIGRATION = "supabase/migrations/20260927120000_pos_operator_access.sql";

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function isMissingSchema(message) {
  return /pos_access_codes|pos_access_code_failures|credential_id|membership_id|pos_access_disabled_at/i.test(String(message || "")) &&
    /schema cache|does not exist|could not find/i.test(String(message || ""));
}

function schemaError() {
  return httpError(503, `POS access codes need a database update. Run ${POS_ACCESS_MIGRATION} in the Supabase SQL Editor.`, "POS_ACCESS_SCHEMA");
}

function ensure(result) {
  if (result.error) {
    if (isMissingSchema(result.error.message)) throw schemaError();
    throw result.error;
  }
  return result.data;
}

/** HMAC key. POS_ACCESS_CODE_SECRET if set, otherwise derived from the service-role key (server-only). */
function codeSecret(env = process.env) {
  const explicit = String(env.POS_ACCESS_CODE_SECRET || "").trim();
  if (explicit) return explicit;
  const base = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base) throw httpError(503, "POS access codes are not configured on this server.", "POS_CODE_SECRET_MISSING");
  return crypto.createHmac("sha256", base).update("paidly-pos-access-code:v1").digest("hex");
}

export function normalizePosAccessCode(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === POS_ACCESS_CODE_LENGTH ? digits : null;
}

export function hashPosAccessCode(orgId, code, env = process.env) {
  const normalized = normalizePosAccessCode(code);
  if (!normalized || !orgId) return "";
  return crypto.createHmac("sha256", codeSecret(env)).update(`${orgId}:${normalized}`, "utf8").digest("hex");
}

/** Reject codes a person would guess first. */
export function isWeakPosAccessCode(code) {
  const c = String(code || "");
  if (/^(\d)\1+$/.test(c)) return true; // 000000, 111111
  const asc = "01234567890";
  const desc = "09876543210";
  if (asc.includes(c) || desc.includes(c)) return true; // 123456, 654321
  if (/^(\d\d)\1\1$/.test(c) || /^(\d\d\d)\1$/.test(c)) return true; // 121212, 123123
  return false;
}

export function generatePosAccessCode() {
  for (;;) {
    const code = String(crypto.randomInt(0, 10 ** POS_ACCESS_CODE_LENGTH)).padStart(POS_ACCESS_CODE_LENGTH, "0");
    if (!isWeakPosAccessCode(code)) return code;
  }
}

function clientHash(req) {
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || String(req?.socket?.remoteAddress || req?.ip || "unknown");
  return crypto.createHash("sha256").update(`pos-client:${ip}`).digest("hex").slice(0, 32);
}

// ── Loading ───────────────────────────────────────────────────────────────────────

async function loadMembership(orgId, membershipId) {
  if (!isValidUuid(membershipId)) throw httpError(422, "Employee id is required", "EMPLOYEE_REQUIRED");
  const { data, error } = await supabaseAdmin
    .from("memberships")
    .select("id, org_id, user_id, role, job_function, pos_register_id, disabled_at, pos_access_disabled_at, invited_name, invited_email")
    .eq("org_id", orgId)
    .eq("id", membershipId)
    .maybeSingle();
  if (error) {
    if (isMissingSchema(error.message)) throw schemaError();
    throw error;
  }
  if (!data) throw httpError(404, "Employee not found", "EMPLOYEE_NOT_FOUND");
  return data;
}

async function membershipDisplayName(membership) {
  if (membership?.user_id) {
    const { data } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", membership.user_id).maybeSingle();
    if (data?.full_name) return { name: data.full_name, email: data.email || membership.invited_email || null };
    if (data?.email) return { name: membership.invited_name || data.email, email: data.email };
  }
  return { name: membership?.invited_name || membership?.invited_email || "Employee", email: membership?.invited_email || null };
}

export function posAccessIsDisabled(membership) {
  return Boolean(membership?.disabled_at || membership?.pos_access_disabled_at);
}

function assertPosEnabledMember(membership) {
  if (membership.disabled_at) throw httpError(409, "This employee is disabled", "EMPLOYEE_DISABLED");
  if (
    !membershipIsPosEnabled({
      companyRole: membership.role,
      job_function: membership.job_function,
      pos_register_id: membership.pos_register_id,
    })
  ) {
    throw httpError(409, "Turn on POS access for this employee first (POS job or an assigned till).", "POS_NOT_ENABLED_FOR_EMPLOYEE");
  }
}

// ── Admin: generate / revoke / enable / disable ───────────────────────────────────

/** End till sessions opened by these credentials or this employee. */
async function revokeSessions(orgId, { credentialIds = [], membershipId = null }) {
  const now = new Date().toISOString();
  if (credentialIds.length) {
    ensure(
      await supabaseAdmin.from("pos_access_sessions").update({ revoked_at: now }).eq("org_id", orgId).in("credential_id", credentialIds).is("revoked_at", null)
    );
  }
  if (membershipId) {
    ensure(
      await supabaseAdmin.from("pos_access_sessions").update({ revoked_at: now }).eq("org_id", orgId).eq("membership_id", membershipId).is("revoked_at", null)
    );
  }
}

async function revokeActiveCodes(orgId, membershipId, actorUserId) {
  const active = ensure(
    await supabaseAdmin.from("pos_access_codes").select("id").eq("org_id", orgId).eq("membership_id", membershipId).is("revoked_at", null)
  ) || [];
  if (!active.length) return [];
  const ids = active.map((row) => row.id);
  ensure(
    await supabaseAdmin
      .from("pos_access_codes")
      .update({ revoked_at: new Date().toISOString(), revoked_by: actorUserId || null })
      .in("id", ids)
      .is("revoked_at", null)
  );
  await revokeSessions(orgId, { credentialIds: ids });
  return ids;
}

/**
 * Generate (or regenerate) an employee's code. The previous code and its till sessions stop working
 * immediately. Returns the plaintext once.
 */
export async function issueMembershipPosCode({ orgId, membershipId, actorUserId = null, registerId = null }) {
  const membership = await loadMembership(orgId, membershipId);
  assertPosEnabledMember(membership);
  if (membership.pos_access_disabled_at) throw httpError(409, "POS access is disabled for this employee. Enable it first.", "POS_ACCESS_DISABLED");
  let register = null;
  if (registerId) {
    if (!isValidUuid(registerId)) throw httpError(422, "Register id is invalid", "REGISTER_INVALID");
    const { data } = await supabaseAdmin.from("pos_registers").select("id, org_id").eq("org_id", orgId).eq("id", registerId).maybeSingle();
    if (!data) throw httpError(422, "That till is not in this business", "REGISTER_INVALID");
    register = data;
  }

  await revokeActiveCodes(orgId, membership.id, actorUserId);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = generatePosAccessCode();
    const { data, error } = await supabaseAdmin
      .from("pos_access_codes")
      .insert({
        org_id: orgId,
        membership_id: membership.id,
        register_id: register?.id || null,
        code_hash: hashPosAccessCode(orgId, code),
        created_by: actorUserId || null,
      })
      .select("id, created_at, register_id")
      .single();
    if (!error) return { code, credential: data };
    if (isMissingSchema(error.message)) throw schemaError();
    if (error.code !== "23505") throw error;
    // Collision with another employee's active code in this business (or a racing regenerate) — retry.
  }
  throw httpError(409, "Could not generate a unique code. Try again.", "POS_CODE_BUSY");
}

export async function revokeMembershipPosCode({ orgId, membershipId, actorUserId = null }) {
  const membership = await loadMembership(orgId, membershipId);
  const revoked = await revokeActiveCodes(orgId, membership.id, actorUserId);
  await revokeSessions(orgId, { membershipId: membership.id });
  return { revoked: revoked.length };
}

export async function setMembershipPosAccessEnabled({ orgId, membershipId, enabled, actorUserId = null }) {
  const membership = await loadMembership(orgId, membershipId);
  if (enabled) {
    assertPosEnabledMember(membership);
    ensure(await supabaseAdmin.from("memberships").update({ pos_access_disabled_at: null }).eq("org_id", orgId).eq("id", membership.id));
  } else {
    ensure(
      await supabaseAdmin.from("memberships").update({ pos_access_disabled_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", membership.id)
    );
    await revokeActiveCodes(orgId, membership.id, actorUserId);
    await revokeSessions(orgId, { membershipId: membership.id });
  }
  return { enabled: Boolean(enabled) };
}

/** Code status per employee for admin screens — never includes a hash or a code. */
export async function posCodeSummaries(orgId, membershipIds) {
  const ids = [...new Set((membershipIds || []).filter((id) => isValidUuid(id)))];
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await supabaseAdmin
    .from("pos_access_codes")
    .select("id, membership_id, register_id, created_at, last_used_at")
    .eq("org_id", orgId)
    .in("membership_id", ids)
    .is("revoked_at", null);
  if (error) return out; // schema not applied yet → no codes
  for (const row of data || []) {
    out.set(row.membership_id, {
      status: "active",
      credential_id: row.id,
      register_id: row.register_id || null,
      created_at: row.created_at,
      last_used_at: row.last_used_at,
    });
  }
  return out;
}

// ── Public: till info + code entry ────────────────────────────────────────────────

async function loadActiveTill(tillId) {
  if (!isValidUuid(tillId)) return null;
  const { data } = await supabaseAdmin.from("pos_registers").select("id, org_id, name, status, company_id").eq("id", tillId).maybeSingle();
  if (!data || data.status !== "active") return null;
  return data;
}

async function tillBusinessName(till) {
  if (till.company_id) {
    const { data } = await supabaseAdmin.from("companies").select("name").eq("id", till.company_id).eq("org_id", till.org_id).maybeSingle();
    if (data?.name) return data.name;
  }
  const { data } = await supabaseAdmin.from("organizations").select("name").eq("id", till.org_id).maybeSingle();
  return data?.name || null;
}

/**
 * GET /api/pos/till-info?id= — what the code screen shows ("Main Till · CoffeeShop").
 * The till id comes from the till link; it is not a credential and reveals no operators.
 */
/**
 * Can this deployment verify codes? (secret configured + operator-access schema installed).
 * Lets the code screen say "not set up yet" instead of failing every attempt.
 */
export async function posAccessCodesReady(orgId, env = process.env) {
  try {
    codeSecret(env);
  } catch {
    return { ready: false, reason: "secret_missing" };
  }
  const { error } = await supabaseAdmin.from("pos_access_codes").select("id").eq("org_id", orgId).limit(1);
  if (error) return { ready: false, reason: isMissingSchema(error.message) ? "schema_missing" : "unavailable" };
  return { ready: true };
}

function supportRef() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export async function handlePosTillInfo(req, res) {
  const tillId = String(req.query?.id || "").trim();
  try {
    const till = await loadActiveTill(tillId);
    if (!till || !(await orgHasPosCapability(till.org_id))) {
      return res.status(404).json({ error: "This till link is not active. Ask your manager for a new one.", code: "TILL_NOT_FOUND" });
    }
    const readiness = await posAccessCodesReady(till.org_id);
    if (!readiness.ready) console.error("[pos-till-info] access codes not ready", readiness.reason, till.org_id);
    return res.status(200).json({
      ok: true,
      till: { id: till.id, name: till.name },
      business: { name: await tillBusinessName(till) },
      access_codes: readiness.ready ? "ready" : "unavailable",
    });
  } catch (err) {
    const ref = supportRef();
    console.error(`[pos-till-info] ref=${ref}`, err?.message || err);
    return res.status(500).json({ error: "Could not load this till. Try again in a moment.", code: "TILL_INFO_ERROR", ref });
  }
}

async function recentFailures(column, value) {
  const since = new Date(Date.now() - POS_CODE_FAILURE_WINDOW_MS).toISOString();
  const { data, error } = await supabaseAdmin.from("pos_access_code_failures").select("id").eq(column, value).gte("failed_at", since).limit(100);
  if (error) {
    if (isMissingSchema(error.message)) throw schemaError();
    return 0;
  }
  return (data || []).length;
}

async function recordFailure(till, client) {
  await supabaseAdmin
    .from("pos_access_code_failures")
    .insert({ org_id: till?.org_id || null, register_id: till?.id || null, client_hash: client })
    .then(() => null, () => null);
}

/**
 * POST /api/pos/code-unlock { till_id, code } — verify an operator code and open a scoped till session.
 * Verifies: till active → business (from the till) → code in that business → employee active,
 * POS-enabled, not POS-disabled, allowed on this till → POS plan + business type.
 */
export async function handlePosCodeUnlock(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const tillId = String(body.till_id || "").trim();
  const client = clientHash(req);
  const denied = (status, error, code) => res.status(status).json({ error, code });
  try {
    const till = await loadActiveTill(tillId);
    if (!till) return denied(404, "This till link is not active. Ask your manager for a new one.", "TILL_NOT_FOUND");
    if ((await recentFailures("register_id", till.id)) >= POS_CODE_MAX_FAILURES_PER_TILL || (await recentFailures("client_hash", client)) >= POS_CODE_MAX_FAILURES_PER_CLIENT) {
      return denied(429, "Too many incorrect codes. Wait 15 minutes or ask your manager.", "POS_CODE_RATE_LIMITED");
    }
    const code = normalizePosAccessCode(body.code);
    if (!code) {
      await recordFailure(till, client);
      return denied(401, "That code is not valid for this till.", "POS_CODE_INVALID");
    }
    const credential = ensure(
      await supabaseAdmin
        .from("pos_access_codes")
        .select("id, org_id, membership_id, register_id, revoked_at")
        .eq("org_id", till.org_id)
        .eq("code_hash", hashPosAccessCode(till.org_id, code))
        .is("revoked_at", null)
        .maybeSingle()
    );
    // Same message for unknown, revoked or wrong-till codes: never confirm which part failed.
    if (!credential || (credential.register_id && credential.register_id !== till.id)) {
      await recordFailure(till, client);
      return denied(401, "That code is not valid for this till.", "POS_CODE_INVALID");
    }
    const membership = await loadMembership(till.org_id, credential.membership_id);
    if (posAccessIsDisabled(membership)) return denied(403, "POS access is turned off for you. Ask your manager.", "POS_ACCESS_DISABLED");
    if (!membershipIsPosEnabled({ companyRole: membership.role, job_function: membership.job_function, pos_register_id: membership.pos_register_id })) {
      return denied(403, "POS access is turned off for you. Ask your manager.", "POS_ACCESS_DISABLED");
    }
    if (membership.pos_register_id && membership.pos_register_id !== till.id) {
      return denied(403, "You are assigned to a different till.", "TILL_NOT_ASSIGNED");
    }
    if (!(await orgHasPosCapability(till.org_id))) return denied(403, "POS is not enabled for this business.", "POS_NOT_ENABLED");
    if (!(await requirePosPlanForOrg(res, till.org_id))) return undefined;

    const person = await membershipDisplayName(membership);
    const token = generatePosAccessToken();
    const now = new Date();
    const sessionRow = {
      org_id: till.org_id,
      register_id: till.id,
      membership_id: membership.id,
      credential_id: credential.id,
      user_id: membership.user_id || null,
      employee_email: person.email,
      employee_name: person.name,
      // Till operators are always scoped as POS-only staff, whatever their back-office role.
      role: "employee",
      job_function: POS_JOB_FUNCTION,
      token_hash: hashPosAccessToken(token),
      issued_at: now.toISOString(),
      expires_at: new Date(now.getTime() + POS_CODE_SESSION_TTL_SECONDS * 1000).toISOString(),
    };
    const sessionSelect =
      "id, org_id, register_id, membership_id, credential_id, user_id, employee_email, employee_name, role, job_function, issued_at, expires_at, revoked_at";
    let inserted = await supabaseAdmin.from("pos_access_sessions").insert(sessionRow).select(sessionSelect).single();
    if (inserted.error?.code === "23503" && /user_id/i.test(inserted.error.message || "") && sessionRow.user_id) {
      // The employee's linked Paidly login no longer exists (deleted/stale user). A code session is
      // identified by membership_id, so open it without the dangling login link.
      console.warn("[pos-code-unlock] membership has a stale user_id; opening the till session without it", membership.id);
      sessionRow.user_id = null;
      inserted = await supabaseAdmin.from("pos_access_sessions").insert(sessionRow).select(sessionSelect).single();
    }
    const row = ensure(inserted);
    await supabaseAdmin.from("pos_access_codes").update({ last_used_at: now.toISOString() }).eq("id", credential.id).then(() => null, () => null);

    const { data: openShift } = await supabaseAdmin
      .from("pos_register_sessions")
      .select("id, status, register_id, opened_at")
      .eq("org_id", till.org_id)
      .eq("register_id", till.id)
      .eq("status", "open")
      .maybeSingle();
    const { data: org } = await supabaseAdmin.from("organizations").select("name, business_type").eq("id", till.org_id).maybeSingle();
    res.setHeader("Set-Cookie", buildPosAccessCookie(token, { maxAgeSeconds: POS_CODE_SESSION_TTL_SECONDS, secure: isSecureRequest(req) }));
    return res.status(200).json({
      ...publicPosAccessView(row, {
        orgName: org?.name || null,
        businessType: org?.business_type ?? null,
        register: { id: till.id, name: till.name, status: till.status },
        openShift: openShift || null,
      }),
      auth_method: "code",
      access_token: token,
    });
  } catch (err) {
    if (err?.status) return denied(err.status, err.message, err.code);
    // A system fault, not a wrong code: the attempt is not counted against the till. The reference ties
    // what the operator sees to the server log line.
    const ref = supportRef();
    console.error(`[pos-code-unlock] ref=${ref} code=${err?.code || ""}`, err?.message || err);
    return res.status(500).json({
      error: `Paidly couldn't open the till just now — this isn't your code. Try again, or give your manager reference ${ref}.`,
      code: "POS_CODE_ERROR",
      ref,
    });
  }
}
