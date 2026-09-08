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
import { provisionEmployeeWorkforce, registerWorkforceSubscribers } from "./employeeProvisioning.js";
import { johannesburgYmd } from "../../../shared/payroll/dates.js";
import { computeLeaveBalance } from "../../../shared/leave/leaveMath.js";
import { sanitizeEmployeeWritePayload, parseManagerMembershipId } from "../../../shared/workforce/employeeWrite.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { assertOwnEmployee, assertSameOrg } from "./workforceAuth.js";

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
      "id, user_id, role, job_function, employee_number, department, employment_status, employment_start_date, invited_email, disabled_at, created_at"
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, email, phone, job_title, department").in("id", userIds)
    : { data: [] };
  const byUser = new Map((profiles || []).map((p) => [p.id, p]));

  const { data: payrollRows } = await supabaseAdmin
    .from("payroll_profiles")
    .select(
      "id, membership_id, user_id, employee_number, full_name, email, job_title, department, base_salary, hourly_rate, daily_rate, pay_type, employment_status, payroll_status"
    )
    .eq("org_id", orgId);
  const payrollByMembership = new Map((payrollRows || []).map((p) => [p.membership_id, p]));
  const employeeIds = (members || []).map((m) => m.id).filter(Boolean);
  const year = johannesburgYmd().year;

  let attendanceRows = [];
  let leaveRows = [];
  let payslipRows = [];
  if (employeeIds.length) {
    try {
      const attendance = await supabaseAdmin
        .from("attendance_profiles")
        .select("employee_id, status")
        .in("employee_id", employeeIds);
      attendanceRows = attendance.data || [];
    } catch {
      attendanceRows = [];
    }
    try {
      const leave = await supabaseAdmin
        .from("leave_balances")
        .select("employee_id, accrued, used, pending, leave_types(code, name)")
        .eq("org_id", orgId)
        .eq("leave_year", year)
        .in("employee_id", employeeIds);
      leaveRows = leave.data || [];
    } catch {
      leaveRows = [];
    }
    try {
      const payslips = await supabaseAdmin
        .from("payslips")
        .select("id, membership_id")
        .eq("org_id", orgId)
        .in("membership_id", employeeIds);
      payslipRows = payslips.data || [];
    } catch {
      payslipRows = [];
    }
  }
  const attendanceByEmployee = new Map(attendanceRows.map((row) => [row.employee_id, row]));
  const leaveByEmployee = new Map();
  for (const row of leaveRows) {
    const list = leaveByEmployee.get(row.employee_id) || [];
    list.push(row);
    leaveByEmployee.set(row.employee_id, list);
  }
  const payslipCountByEmployee = new Map();
  for (const row of payslipRows) {
    if (!row.membership_id) continue;
    payslipCountByEmployee.set(row.membership_id, (payslipCountByEmployee.get(row.membership_id) || 0) + 1);
  }

  return (members || []).map((m) => {
    const person = byUser.get(m.user_id);
    const payroll = payrollByMembership.get(m.id);
    const email = person?.email || m.invited_email || payroll?.email || null;
    const name = person?.full_name || payroll?.full_name || email || "Employee";
    const balances = leaveByEmployee.get(m.id) || [];
    const annual = balances.find((row) => String(row.leave_types?.code || "").toUpperCase() === "ANNUAL");
    const leaveDays = annual ? computeLeaveBalance(annual).available : null;
    return {
      id: m.id,
      employee_id: m.id,
      membership_id: m.id,
      payroll_profile_id: payroll?.id || null,
      user_id: m.user_id,
      role: normalizeCompanyRole(m.role),
      job_function: normalizeJobFunction(m.job_function),
      employee_number: m.employee_number || payroll?.employee_number || null,
      department: m.department || payroll?.department || person?.department || null,
      job_title: payroll?.job_title || person?.job_title || null,
      employment_status: m.employment_status || payroll?.employment_status || "active",
      employment_start_date: m.employment_start_date || null,
      email,
      phone: person?.phone || null,
      full_name: person?.full_name || payroll?.full_name || null,
      base_salary: payroll?.base_salary ?? 0,
      hourly_rate: payroll?.hourly_rate ?? 0,
      daily_rate: payroll?.daily_rate ?? 0,
      pay_type: payroll?.pay_type || "monthly_salary",
      label: name,
      payroll_status: payroll?.payroll_status || (payroll?.id ? "active" : "unprovisioned"),
      attendance_status: attendanceByEmployee.get(m.id)?.status || (payroll?.id ? "active" : "unprovisioned"),
      leave_available: leaveDays,
      payslip_count: payslipCountByEmployee.get(m.id) || 0,
      portal_status: m.user_id ? "active" : "invited",
      disabled_at: m.disabled_at || null,
    };
  });
}

export async function getEmployee(orgId, employeeId, { actorUserId, actorMembershipId, canViewTeam }) {
  const rows = await listEmployees(orgId);
  const row = rows.find((item) => item.id === employeeId);
  if (!row) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  assertSameOrg({ companyId: orgId }, { org_id: orgId });
  assertOwnEmployee(
    { userId: actorUserId, id: actorMembershipId },
    row,
    { canViewTeam }
  );
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
  const safe = sanitizeEmployeeWritePayload(payload);
  const email = String(safe.email || "").trim().toLowerCase();
  const fullName = String(safe.full_name || safe.fullName || "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = new Error("Enter a valid email address");
    err.status = 400;
    throw err;
  }

  let role = normalizeCompanyRole(safe.role);
  let jobFunction = normalizeJobFunction(safe.job_function ?? safe.jobFunction ?? "general");
  if (isPosStaffInviteRequest({ role, jobFunction, source: safe.source })) {
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

  const managerId = parseManagerMembershipId(safe.manager_membership_id || safe.managerMembershipId);
  if (managerId) {
    const { data: manager } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("id", managerId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!manager?.id) {
      const err = new Error("manager_membership_id is not in your company");
      err.status = 403;
      throw err;
    }
  }

  const employeeNumber = await nextOrgEmployeeNumber(orgId);
  const membershipRow = {
    org_id: orgId,
    user_id: existingProfile?.id || null,
    role: role === COMPANY_ROLES.ADMIN ? "admin" : role,
    job_function: jobFunction === POS_JOB_FUNCTION ? "general" : jobFunction,
    employee_number: employeeNumber,
    department: String(safe.department || "").trim() || null,
    employment_status: "active",
    invited_email: email,
    manager_membership_id: managerId || null,
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
  if (inserted.error && /manager_membership_id/i.test(inserted.error.message || "")) {
    delete membershipRow.manager_membership_id;
    const retry = await supabaseAdmin.from("memberships").insert(membershipRow).select("id, user_id").maybeSingle();
    inserted.error = retry.error;
    inserted.data = retry.data;
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
  try {
    await provisionEmployeeWorkforce(orgId, employeeId);
  } catch (err) {
    console.warn("[workforce] immediate provision failed:", err?.message || err);
  }
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

export async function updateEmployee(orgId, actor, employeeId, payload = {}) {
  const id = parseUuid(employeeId);
  if (!id) {
    const err = new Error("Employee id is required");
    err.status = 400;
    throw err;
  }
  const safe = sanitizeEmployeeWritePayload(payload);
  const { data: existing } = await supabaseAdmin
    .from("memberships")
    .select("id, org_id, user_id, department, employment_status, employment_start_date, employment_end_date, manager_membership_id, employee_number")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!existing?.id) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  assertSameOrg({ companyId: orgId }, existing);

  const managerId = parseManagerMembershipId(safe.manager_membership_id || safe.managerMembershipId);
  if (managerId) {
    if (managerId === id) {
      const err = new Error("An employee cannot manage themselves");
      err.status = 400;
      throw err;
    }
    const { data: manager } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("id", managerId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!manager?.id) {
      const err = new Error("manager_membership_id is not in your company");
      err.status = 403;
      throw err;
    }
  }

  const patch = {};
  if (safe.department !== undefined) patch.department = String(safe.department || "").trim() || null;
  if (safe.employment_status !== undefined) {
    patch.employment_status = String(safe.employment_status || "active").trim() || "active";
  }
  if (safe.employment_start_date !== undefined) {
    patch.employment_start_date = safe.employment_start_date || null;
  }
  if (safe.employment_end_date !== undefined) {
    patch.employment_end_date = safe.employment_end_date || null;
  }
  if (safe.manager_membership_id !== undefined || safe.managerMembershipId !== undefined) {
    patch.manager_membership_id = managerId || null;
  }

  if (Object.keys(patch).length) {
    const { error } = await supabaseAdmin.from("memberships").update(patch).eq("id", id).eq("org_id", orgId);
    if (error) throw error;
  }

  await emitWorkforceEvent({
    orgId,
    employeeId: id,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED,
    actorId: actor.userId,
    payload: { fields: Object.keys(patch) },
    idempotencyKey: `membership:${id}:updated:${Date.now()}`,
  });

  return getEmployee(orgId, id, { canViewTeam: true });
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

export async function emitEmployeePortalActivated(orgId, membershipId, actorId) {
  if (!orgId || !membershipId) return null;
  return emitWorkforceEvent({
    orgId,
    employeeId: membershipId,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_PORTAL_ACTIVATED,
    actorId,
    payload: { source: "invite_accept" },
    idempotencyKey: `membership:${membershipId}:portal_activated`,
  });
}
