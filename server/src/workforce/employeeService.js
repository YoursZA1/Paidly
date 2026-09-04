import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeCompanyRole, normalizeJobFunction, COMPANY_ROLES } from "../companyRouteAccess.js";
import { isPosStaffInviteRequest, POS_JOB_FUNCTION } from "../../../shared/posStaffInvite.js";
import { buildEmployeeNumber, nextEmployeeSequence } from "../../../shared/payroll/payslipNumber.js";
import { companyInviteShareUrl } from "../companyInviteAppUrl.js";
import { sendCompanyTeamInviteEmail } from "../companyTeamInviteDelivery.js";
import {
  emitWorkforceEvent,
  WORKFORCE_EVENT_TYPES,
  membershipCreatedIdempotencyKey,
} from "./workforceEvents.js";
import { registerWorkforceSubscribers } from "./employeeProvisioning.js";

registerWorkforceSubscribers();

function hashInviteToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

async function nextOrgEmployeeNumber(orgId) {
  const { data } = await supabaseAdmin
    .from("memberships")
    .select("employee_number")
    .eq("org_id", orgId);
  const used = (data || []).map((row) => row.employee_number).filter(Boolean);
  return buildEmployeeNumber(nextEmployeeSequence(used));
}

export async function listEmployees(orgId) {
  try {
    const { retryFailedWorkforceEvents } = await import("./workforceEvents.js");
    await retryFailedWorkforceEvents({ limit: 10 });
  } catch {
    /* schema may not be applied yet */
  }
  const { data: members, error } = await supabaseAdmin
    .from("memberships")
    .select(
      "id, user_id, role, job_function, employee_number, department, employment_status, invited_email, disabled_at, created_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", userIds)
    : { data: [] };
  const byUser = new Map((profiles || []).map((p) => [p.id, p]));

  return (members || []).map((m) => {
    const person = byUser.get(m.user_id);
    const email = person?.email || m.invited_email || null;
    const name = person?.full_name || email || "Employee";
    return {
      id: m.id,
      employee_id: m.id,
      user_id: m.user_id,
      role: normalizeCompanyRole(m.role),
      job_function: normalizeJobFunction(m.job_function),
      employee_number: m.employee_number,
      department: m.department,
      employment_status: m.employment_status || "active",
      email,
      full_name: person?.full_name || null,
      label: name,
      portal_status: m.user_id ? "active" : "invited",
      disabled_at: m.disabled_at || null,
    };
  });
}

export async function getEmployee(orgId, employeeId, { actorUserId, canViewTeam }) {
  const rows = await listEmployees(orgId);
  const row = rows.find((item) => item.id === employeeId);
  if (!row) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  if (!canViewTeam && row.user_id !== actorUserId) {
    const err = new Error("Not authorized for this employee");
    err.status = 403;
    throw err;
  }
  return row;
}

async function persistPortalInvite({ orgId, email, role, jobFunction, actorId, membershipId, invitedName }) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const row = {
    email,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    org_id: orgId,
    token,
    token_hash: hashInviteToken(token),
    status: "pending",
    expires_at: expiresAt,
    created_by: actorId,
    source: "company_admin",
    job_function: jobFunction,
    membership_id: membershipId,
    invited_name: invitedName || null,
  };
  const { data, error } = await supabaseAdmin.from("company_invites").insert(row).select("id").maybeSingle();
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) {
    const { data: existing } = await supabaseAdmin
      .from("company_invites")
      .select("id, token, expires_at")
      .eq("org_id", orgId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing?.token) {
      return {
        id: existing.id,
        token: existing.token,
        expiresAt: existing.expires_at,
        inviteLink: companyInviteShareUrl(existing.token),
      };
    }
  }
  if (error && /membership_id/i.test(error.message || "")) {
    delete row.membership_id;
    const retry = await supabaseAdmin.from("company_invites").insert(row).select("id").maybeSingle();
    if (retry.error) throw retry.error;
    return {
      id: retry.data?.id,
      token,
      expiresAt,
      inviteLink: companyInviteShareUrl(token),
    };
  }
  if (error) throw error;
  return {
    id: data?.id,
    token,
    expiresAt,
    inviteLink: companyInviteShareUrl(token),
  };
}

export async function createEmployee(orgId, actor, payload = {}) {
  const email = String(payload.email || "").trim().toLowerCase();
  const fullName = String(payload.full_name || payload.fullName || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("Enter a valid email address");
    err.status = 400;
    throw err;
  }

  let role = normalizeCompanyRole(payload.role);
  let jobFunction = normalizeJobFunction(payload.job_function ?? payload.jobFunction ?? "general");
  if (isPosStaffInviteRequest({ role, jobFunction, source: payload.source })) {
    const err = new Error("POS staff must be invited from Team or the till, not Workforce create.");
    err.status = 422;
    err.code = "POS_INVITE_PATH";
    throw err;
  }
  if (role === COMPANY_ROLES.ADMIN && actor.companyRole !== COMPANY_ROLES.ADMIN) {
    const err = new Error("Only a company admin can create another admin.");
    err.status = 403;
    throw err;
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile?.id === actor.userId) {
    const err = new Error("You cannot add yourself");
    err.status = 400;
    throw err;
  }

  const employeeNumber = await nextOrgEmployeeNumber(orgId);
  const membershipRow = {
    org_id: orgId,
    user_id: existingProfile?.id || null,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    job_function: jobFunction === POS_JOB_FUNCTION ? "general" : jobFunction,
    employee_number: employeeNumber,
    department: String(payload.department || "").trim() || null,
    employment_status: "active",
    invited_email: email,
  };

  const inserted = await supabaseAdmin
    .from("memberships")
    .insert(membershipRow)
    .select("id, user_id")
    .maybeSingle();

  if (inserted.error && existingProfile?.id && /duplicate|unique/i.test(inserted.error.message || "")) {
    const { data: existingMem } = await supabaseAdmin
      .from("memberships")
      .select("id, user_id")
      .eq("org_id", orgId)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMem?.id) {
      await emitWorkforceEvent({
        orgId,
        employeeId: existingMem.id,
        eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
        actorId: actor.userId,
        payload: { source: "existing_membership" },
        idempotencyKey: membershipCreatedIdempotencyKey(existingMem.id),
      });
      return { employee: await getEmployee(orgId, existingMem.id, { canViewTeam: true }), mode: "existing_member" };
    }
  }
  if (inserted.error) {
    if (/user_id|not-null|null value/i.test(inserted.error.message || "")) {
      const err = new Error(
        "Workforce schema is not applied. Run 20260905120000_workforce_engine_core.sql in the Supabase SQL Editor."
      );
      err.status = 503;
      err.code = "WORKFORCE_SCHEMA";
      throw err;
    }
    throw inserted.error;
  }

  const employeeId = inserted.data.id;
  await emitWorkforceEvent({
    orgId,
    employeeId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
    actorId: actor.userId,
    payload: { source: "create_employee", email },
    idempotencyKey: membershipCreatedIdempotencyKey(employeeId),
  });

  let invite = null;
  if (existingProfile?.id) {
    await emitWorkforceEvent({
      orgId,
      employeeId,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED,
      actorId: actor.userId,
      payload: { source: "existing_user" },
      idempotencyKey: `membership:${employeeId}:portal_activated`,
    });
  } else {
    invite = await persistPortalInvite({
      orgId,
      email,
      role,
      jobFunction,
      actorId: actor.userId,
      membershipId: employeeId,
      invitedName: fullName || null,
    });
    const { data: orgRow } = await supabaseAdmin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    await sendCompanyTeamInviteEmail({
      to: email,
      inviteLink: invite.inviteLink,
      companyName: orgRow?.name || "your company",
      inviterName: "Your team admin",
      roleLabel: role,
    });
    await emitWorkforceEvent({
      orgId,
      employeeId,
      eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_INVITED,
      actorId: actor.userId,
      payload: { invite_id: invite.id },
      idempotencyKey: `membership:${employeeId}:portal_invited`,
    });
  }

  return {
    employee: await getEmployee(orgId, employeeId, { canViewTeam: true }),
    mode: existingProfile?.id ? "existing_user" : "invited",
    invite_link: invite?.inviteLink || null,
  };
}

export async function emitEmployeeCreatedForMembership(orgId, membershipId, actorId) {
  if (!orgId || !membershipId) return null;
  return emitWorkforceEvent({
    orgId,
    employeeId: membershipId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_CREATED,
    actorId,
    payload: { source: "membership_upsert" },
    idempotencyKey: membershipCreatedIdempotencyKey(membershipId),
  });
}
