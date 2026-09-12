import crypto from "node:crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { normalizeCompanyRole, normalizeJobFunction, COMPANY_ROLES, membershipHasPermission, PERMISSIONS } from "../companyRouteAccess.js";
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
import { buildEmployeeProfile } from "../../../shared/workforce/employeeProfile.js";
import { mergeEmployeeTimeline } from "../../../shared/workforce/employeeTimeline.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { assertOwnEmployee, assertSameOrg } from "./workforceAuth.js";
import { throwIfMissingWorkforceColumn } from "./schemaGuard.js";
import { writeWorkforceAudit } from "./workforceAudit.js";
import { loadOutstandingAdjustmentSignals } from "./adjustmentSignals.js";

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

export async function listEmployees(orgId, { actorMembershipId = null, canManagePayroll = false, managerScopeId = null } = {}) {
  const expandedCols =
    "id, user_id, role, job_function, employee_number, department, employment_status, employment_start_date, employment_end_date, manager_membership_id, invited_email, invited_name, job_title, disabled_at, created_at";
  const legacyCols =
    "id, user_id, role, job_function, employee_number, department, employment_status, employment_start_date, invited_email, disabled_at, created_at";
  let membersQuery = await supabaseAdmin
    .from("memberships")
    .select(expandedCols)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (membersQuery.error && /invited_name|job_title|employment_end_date|manager_membership_id|schema cache|column/i.test(membersQuery.error.message || "")) {
    membersQuery = await supabaseAdmin
      .from("memberships")
      .select(legacyCols)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
  }
  const { data: members, error } = membersQuery;
  if (error) throw error;
  const scoped = managerScopeId
    ? (members || []).filter((m) => m.id === managerScopeId || m.manager_membership_id === managerScopeId)
    : members || [];

  const userIds = scoped.map((m) => m.user_id).filter(Boolean);
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
  const employeeIds = scoped.map((m) => m.id).filter(Boolean);
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
  const memberById = new Map(scoped.map((m) => [m.id, m]));

  return scoped.map((m) => {
    const person = byUser.get(m.user_id);
    const payroll = payrollByMembership.get(m.id);
    const balances = leaveByEmployee.get(m.id) || [];
    const annual = balances.find((row) => String(row.leave_types?.code || "").toUpperCase() === "ANNUAL");
    const leaveDays = annual ? computeLeaveBalance(annual).available : null;
    const managerMem = m.manager_membership_id ? memberById.get(m.manager_membership_id) : null;
    const managerPerson = managerMem ? byUser.get(managerMem.user_id) : null;
    const managerName =
      managerPerson?.full_name || managerMem?.invited_name || managerMem?.invited_email || null;
    return buildEmployeeProfile(
      {
        membership: {
          ...m,
          role: normalizeCompanyRole(m.role),
          job_function: normalizeJobFunction(m.job_function),
        },
        profile: person,
        payrollProfile: payroll,
        attendance: attendanceByEmployee.get(m.id),
        leaveAvailable: leaveDays,
        payslipCount: payslipCountByEmployee.get(m.id) || 0,
        manager: managerMem ? { id: managerMem.id, full_name: managerName, label: managerName } : null,
      },
      { actorMembershipId, canManagePayroll }
    );
  });
}

export async function getEmployee(orgId, employeeId, { actorUserId, actorMembershipId, canViewTeam, canManagePayroll = false }) {
  const rows = await listEmployees(orgId, { actorMembershipId, canManagePayroll });
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

function redactPayslipRow(row, canSeePay) {
  if (canSeePay) {
    return {
      id: row.id,
      payslip_number: row.payslip_number,
      pay_period_start: row.pay_period_start,
      pay_period_end: row.pay_period_end,
      pay_date: row.pay_date,
      net_pay: row.net_pay,
      gross_pay: row.gross_pay,
      locked: Boolean(row.locked || row.pay_run_id),
    };
  }
  return {
    id: row.id,
    payslip_number: row.payslip_number,
    pay_period_start: row.pay_period_start,
    pay_period_end: row.pay_period_end,
    pay_date: row.pay_date,
    locked: Boolean(row.locked || row.pay_run_id),
    compensation_redacted: true,
  };
}

export async function getEmployeeProfile(orgId, employeeId, access) {
  const employee = await getEmployee(orgId, employeeId, access);
  const canSeePay = Boolean(access.canManagePayroll || employee.id === access.actorMembershipId);
  const safe = (promise, fallback) =>
    promise.then((res) => res).catch(() => fallback);

  const [leaveRes, payslipRes, docRes, attendanceRes, auditRes, eventRes] = await Promise.all([
    safe(
      supabaseAdmin
        .from("leave_requests")
        .select("id, status, start_date, end_date, working_days, reason, leave_types(name, code, paid)")
        .eq("org_id", orgId)
        .eq("employee_id", employee.id)
        .order("start_date", { ascending: false })
        .limit(50),
      { data: [] }
    ),
    safe(
      supabaseAdmin
        .from("payslips")
        .select("id, payslip_number, pay_period_start, pay_period_end, pay_date, net_pay, gross_pay, locked, pay_run_id, membership_id")
        .eq("org_id", orgId)
        .eq("membership_id", employee.id)
        .order("pay_period_start", { ascending: false })
        .limit(50),
      { data: [] }
    ),
    safe(
      supabaseAdmin
        .from("documents")
        .select("id, type, title, status, created_at, membership_id")
        .eq("org_id", orgId)
        .eq("membership_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(50),
      { data: [] }
    ),
    safe(
      supabaseAdmin
        .from("attendance_profiles")
        .select("employee_id, status, created_at, updated_at")
        .eq("employee_id", employee.id)
        .maybeSingle(),
      { data: null }
    ),
    safe(
      supabaseAdmin
        .from("workforce_audit_logs")
        .select("id, action, before_state, after_state, event_id, created_at")
        .eq("org_id", orgId)
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(80),
      { data: [] }
    ),
    safe(
      supabaseAdmin
        .from("workforce_events")
        .select("id, event_type, payload, created_at")
        .eq("org_id", orgId)
        .eq("employee_id", employee.id)
        .order("created_at", { ascending: false })
        .limit(80),
      { data: [] }
    ),
  ]);

  return {
    employee,
    leave_requests: leaveRes.data || [],
    payslips: (payslipRes.data || []).map((row) => redactPayslipRow(row, canSeePay)),
    documents: docRes.data || [],
    attendance: attendanceRes.data || { status: employee.attendance_status || "unprovisioned" },
    audit: mergeEmployeeTimeline(auditRes.data || [], eventRes.data || [], {
      canManagePayroll: canSeePay,
    }),
  };
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
  if (error) {
    throwIfMissingWorkforceColumn(error, "membership_id");
    throw error;
  }
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
    invited_name: fullName || null,
    job_title: String(safe.job_title || safe.jobTitle || "").trim() || null,
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
  if (inserted.error && /invited_name|job_title/i.test(inserted.error.message || "")) {
    delete membershipRow.invited_name;
    delete membershipRow.job_title;
    const retry = await supabaseAdmin.from("memberships").insert(membershipRow).select("id, user_id").maybeSingle();
    inserted.error = retry.error;
    inserted.data = retry.data;
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

  const previousManager = existing.manager_membership_id || null;
  const nextManager = patch.manager_membership_id !== undefined ? patch.manager_membership_id : previousManager;
  if (patch.manager_membership_id !== undefined && previousManager !== nextManager) {
    await writeWorkforceAudit({
      orgId,
      employeeId: id,
      actorId: actor.userId,
      action: "manager.changed",
      before: { manager_membership_id: previousManager },
      after: { manager_membership_id: nextManager },
    });
  }

  await emitWorkforceEvent({
    orgId,
    employeeId: id,
    eventType: WORKFORCE_EVENT_TYPES.EMPLOYEE_UPDATED,
    actorId: actor.userId,
    payload: { fields: Object.keys(patch) },
    idempotencyKey: `membership:${id}:updated:${Date.now()}`,
  });

  return getEmployee(orgId, id, {
    actorUserId: actor.userId,
    actorMembershipId: actor.id,
    canViewTeam: true,
    canManagePayroll: membershipHasPermission(actor, PERMISSIONS.MANAGE_PAYROLL),
  });
}

export async function workforceSummary(orgId, { managerScopeId = null } = {}) {
  const employees = await listEmployees(orgId, {
    canManagePayroll: false,
    managerScopeId,
  });
  const now = johannesburgYmd();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ids = employees.map((row) => row.id).filter(Boolean);
  let leaveCounts = { pending: 0, approved: 0, rejected: 0, upcoming: 0 };
  if (ids.length) {
    const { data: leaveRows } = await supabaseAdmin
      .from("leave_requests")
      .select("id, status, start_date, employee_id")
      .eq("org_id", orgId)
      .in("employee_id", ids);
    const today = now.iso;
    for (const row of leaveRows || []) {
      const status = String(row.status || "").toLowerCase();
      if (status === "pending") leaveCounts.pending += 1;
      if (status === "approved") {
        leaveCounts.approved += 1;
        if (row.start_date && row.start_date >= today) leaveCounts.upcoming += 1;
      }
      if (status === "rejected") leaveCounts.rejected += 1;
    }
  }
  const { data: runs } = await supabaseAdmin
    .from("pay_runs")
    .select("id, status, period_start, period_end, period_label, finalized_at")
    .eq("org_id", orgId)
    .order("period_start", { ascending: false })
    .limit(12);
  const current = (runs || [])[0] || null;
  let payslipsGenerated = 0;
  if (ids.length) {
    let payslipCountQuery = supabaseAdmin
      .from("payslips")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (managerScopeId) {
      payslipCountQuery = payslipCountQuery.in("membership_id", ids);
    }
    const payslipCount = await payslipCountQuery;
    if (payslipCount.error) {
      throwIfMissingWorkforceColumn(payslipCount.error, "membership_id");
      throw payslipCount.error;
    }
    payslipsGenerated = payslipCount.count || 0;
  }
  const adjustment = await loadOutstandingAdjustmentSignals(orgId);
  return {
    workforce: {
      total: employees.length,
      active: employees.filter((row) => row.employment_status === "active" && !row.disabled_at).length,
      new_employees: employees.filter((row) => row.created_at && row.created_at >= thirtyDaysAgo).length,
      pending_onboarding: employees.filter((row) => row.portal_status === "invited").length,
      incomplete_profiles: employees.filter(
        (row) => !row.department || !row.manager_membership_id || !row.employment_start_date
      ).length,
    },
    leave: leaveCounts,
    payroll: {
      current_period: current
        ? { label: current.period_label, start: current.period_start, end: current.period_end, status: current.status }
        : null,
      draft: (runs || []).filter((r) => r.status === "draft").length,
      awaiting_review: (runs || []).filter((r) => r.status === "awaiting_approval" || r.status === "calculated").length,
      finalized: (runs || []).filter((r) => r.finalized_at).length,
      payslips_generated: payslipsGenerated || 0,
      needs_adjustment_run: adjustment.needs_adjustment_run,
      adjustment_signals: adjustment.signals,
    },
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
