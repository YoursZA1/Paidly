import { supabaseAdmin, writePayrollAudit, notifyUser } from "../payroll/payrollGate.js";
import { insertPayrollProfileRow } from "../payroll/payrollService.js";
import { johannesburgYmd, leaveYearForDate, formatIsoDate } from "../../../shared/payroll/dates.js";
import { countWorkingDays, computeLeaveBalance, yearToDateAccrual } from "../../../shared/leave/leaveMath.js";
import { validateLeaveApplication } from "../../../shared/leave/validateLeave.js";
import { mapLeaveDbError } from "../../../shared/leave/leaveIds.js";
import { parseUuid, requireUuid } from "../../../shared/ids/uuid.js";
import { canonicalEmployeeId } from "../../../shared/workforce/employeeIdentity.js";
import { sendHtmlEmail } from "../sendInvoice.js";
import { buildEmployeeNumber, nextEmployeeSequence } from "../../../shared/payroll/payslipNumber.js";

const DEFAULT_LEAVE_TYPES = [
  { code: "ANNUAL", name: "Annual leave", paid: true, accrual_method: "monthly", days_per_year: 21, requires_approval: true, sort_order: 1 },
  { code: "SICK", name: "Sick leave", paid: true, accrual_method: "annual", days_per_year: 10, requires_approval: true, sort_order: 2 },
  { code: "FAMILY", name: "Family responsibility", paid: true, accrual_method: "annual", days_per_year: 3, requires_approval: true, sort_order: 3 },
  { code: "UNPAID", name: "Unpaid leave", paid: false, accrual_method: "none", days_per_year: 0, requires_approval: true, sort_order: 4 },
  { code: "STUDY", name: "Study leave", paid: true, accrual_method: "annual", days_per_year: 5, requires_approval: true, sort_order: 5 },
  { code: "MATERNITY", name: "Maternity leave", paid: false, accrual_method: "none", days_per_year: 0, requires_approval: true, sort_order: 6 },
  { code: "PARENTAL", name: "Parental leave", paid: true, accrual_method: "annual", days_per_year: 10, requires_approval: true, sort_order: 7 },
];

export async function ensureLeaveTypes(orgId) {
  const { data: existing } = await supabaseAdmin.from("leave_types").select("code").eq("org_id", orgId);
  const have = new Set((existing || []).map((row) => String(row.code || "").toUpperCase()));
  const missing = DEFAULT_LEAVE_TYPES.filter((type) => !have.has(type.code));
  if (!missing.length) return;
  await supabaseAdmin.from("leave_types").insert(
    missing.map((t) => ({
      org_id: orgId,
      ...t,
      exclude_weekends: true,
      active: true,
      carry_over_days: 0,
    }))
  );
}

function employeeIdOfProfile(profile) {
  return parseUuid(profile?.membership_id);
}

function withEmployeeId(row, profile) {
  const employeeId = employeeIdOfProfile(profile);
  if (employeeId) row.employee_id = employeeId;
  return row;
}

async function insertLeaveRow(table, row) {
  const first = await supabaseAdmin.from(table).insert(row).select("*").maybeSingle();
  if (!first.error) return first;
  if (row.employee_id && /employee_id/i.test(first.error.message || "")) {
    const rest = { ...row };
    delete rest.employee_id;
    return supabaseAdmin.from(table).insert(rest).select("*").maybeSingle();
  }
  return first;
}

const MEMBERSHIP_COLS =
  "id, org_id, user_id, employee_number, department, employment_status, employment_start_date, invited_email, created_at";

async function loadMembership(orgId, { employeeId, userId } = {}) {
  let q = supabaseAdmin.from("memberships").select(MEMBERSHIP_COLS).eq("org_id", orgId);
  if (employeeId) q = q.eq("id", requireUuid(employeeId, "employee id"));
  else if (userId) q = q.eq("user_id", requireUuid(userId, "user id"));
  else return null;
  const { data } = await q.maybeSingle();
  return data || null;
}

async function nextProfileEmployeeNumber(orgId) {
  const { data: profiles } = await supabaseAdmin
    .from("payroll_profiles")
    .select("employee_number")
    .eq("org_id", orgId);
  const { data: members } = await supabaseAdmin
    .from("memberships")
    .select("employee_number")
    .eq("org_id", orgId);
  const used = [
    ...(profiles || []).map((row) => row.employee_number),
    ...(members || []).map((row) => row.employee_number),
  ].filter(Boolean);
  return buildEmployeeNumber(nextEmployeeSequence(used));
}

/**
 * Payroll profile is derived from the employee (`memberships.id`). Never creates a second employee.
 */
async function getOrCreateProfileForMembership(orgId, membership) {
  if (!membership?.id) {
    const err = new Error("Employee record not found.");
    err.status = 400;
    throw err;
  }
  const { data: byMember } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("membership_id", membership.id)
    .maybeSingle();
  if (byMember) return byMember;

  if (membership.user_id) {
    const { data: byUser } = await supabaseAdmin
      .from("payroll_profiles")
      .select("*")
      .eq("org_id", orgId)
      .eq("user_id", membership.user_id)
      .maybeSingle();
    if (byUser) return byUser;
  }

  const { data: person } = membership.user_id
    ? await supabaseAdmin
        .from("profiles")
        .select("full_name, first_name, last_name, email, job_title, department")
        .eq("id", membership.user_id)
        .maybeSingle()
    : { data: null };
  const name =
    person?.full_name ||
    [person?.first_name, person?.last_name].filter(Boolean).join(" ") ||
    person?.email ||
    membership.invited_email ||
    "Employee";
  let number = String(membership.employee_number || "").trim();
  if (!number) {
    number = await nextProfileEmployeeNumber(orgId);
    await supabaseAdmin
      .from("memberships")
      .update({ employee_number: number })
      .eq("id", membership.id)
      .is("employee_number", null);
  }
  const created = await insertPayrollProfileRow({
    org_id: orgId,
    membership_id: membership.id,
    user_id: membership.user_id || null,
    employee_number: number,
    full_name: name,
    email: person?.email || membership.invited_email || null,
    job_title: person?.job_title || null,
    department: membership.department || person?.department || null,
    employment_status: membership.employment_status || "active",
    employment_start_date: membership.employment_start_date || null,
  });
  if (!created) {
    const retry = await supabaseAdmin
      .from("payroll_profiles")
      .select("*")
      .eq("org_id", orgId)
      .eq("membership_id", membership.id)
      .maybeSingle();
    if (retry.data) return retry.data;
    const err = new Error("Could not create a payroll profile for this employee.");
    err.status = 400;
    throw err;
  }
  return created;
}

async function getOrCreateProfile(orgId, userId) {
  const membership = await loadMembership(orgId, { userId });
  if (!membership) {
    const err = new Error("This account is not an employee of this company. Add the person once in Team Members.");
    err.status = 400;
    throw err;
  }
  return getOrCreateProfileForMembership(orgId, membership);
}

async function getOrCreateProfileForEmployee(orgId, employeeId) {
  const membership = await loadMembership(orgId, { employeeId });
  if (!membership) {
    const err = new Error("Employee not found.");
    err.status = 404;
    throw err;
  }
  return getOrCreateProfileForMembership(orgId, membership);
}

async function ensureBalanceRow({ orgId, profile, leaveType, year }) {
  const { data: existing } = await supabaseAdmin
    .from("leave_balances")
    .select("*")
    .eq("payroll_profile_id", profile.id)
    .eq("leave_type_id", leaveType.id)
    .eq("leave_year", year)
    .maybeSingle();
  if (existing) return existing;

  const yearStart = formatIsoDate(year, 1, 1);
  const asOf = johannesburgYmd().iso;
  const accrued = yearToDateAccrual({
    daysPerYear: Number(leaveType.days_per_year) || 0,
    method: leaveType.accrual_method,
    employmentStartIso: profile.employment_start_date,
    yearStartIso: yearStart,
    asOfIso: asOf,
    employmentStatus: profile.employment_status,
  });
  const entitled = Number(leaveType.days_per_year) || 0;
  const row = withEmployeeId(
    {
      org_id: orgId,
      payroll_profile_id: profile.id,
      leave_type_id: leaveType.id,
      leave_year: year,
      entitled,
      accrued,
      used: 0,
      pending: 0,
    },
    profile
  );
  const { data, error } = await insertLeaveRow("leave_balances", row);
  if (error && /duplicate|unique/i.test(error.message || "")) {
    const retry = await supabaseAdmin
      .from("leave_balances")
      .select("*")
      .eq("payroll_profile_id", profile.id)
      .eq("leave_type_id", leaveType.id)
      .eq("leave_year", year)
      .maybeSingle();
    return retry.data;
  }
  if (error) throw mapLeaveDbError(error);
  await insertLeaveRow(
    "leave_transactions",
    withEmployeeId(
      {
        org_id: orgId,
        payroll_profile_id: profile.id,
        leave_type_id: leaveType.id,
        leave_year: year,
        kind: "opening",
        days: accrued,
        balance_after: accrued,
        reason: "Opening / year-to-date accrual",
      },
      profile
    )
  );
  return data;
}

function availableOf(balance) {
  return computeLeaveBalance(balance).available;
}

export async function myLeave(orgId, userId) {
  await ensureLeaveTypes(orgId);
  const profile = await getOrCreateProfile(orgId, userId);
  const { data: types } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  const year = johannesburgYmd().year;
  const balances = [];
  for (const type of types || []) {
    const row = await ensureBalanceRow({ orgId, profile, leaveType: type, year });
    balances.push({
      leave_type: type,
      ...computeLeaveBalance(row),
      balance_id: row.id,
    });
  }
  const { data: requests, error: requestError } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(name, code)")
    .eq("org_id", orgId)
    .eq("payroll_profile_id", profile.id)
    .order("start_date", { ascending: false })
    .limit(100);
  if (requestError) throw mapLeaveDbError(requestError);
  return { profile, balances, requests: requests || [] };
}

export async function applyForLeave(orgId, userId, body) {
  await ensureLeaveTypes(orgId);
  const actorId = requireUuid(userId, "user id");
  const profile = await getOrCreateProfile(orgId, actorId);
  if (profile.employment_status === "terminated" || profile.employment_status === "suspended") {
    const err = new Error("Inactive employees cannot apply for leave.");
    err.status = 400;
    throw err;
  }
  const leaveTypeId = requireUuid(body.leave_type_id, "leave type id");
  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (!leaveType) {
    const err = new Error("Leave type not found.");
    err.status = 404;
    throw err;
  }
  const year = leaveYearForDate(body.start_date);
  const balance = await ensureBalanceRow({ orgId, profile, leaveType, year });
  const { data: overlapping } = await supabaseAdmin
    .from("leave_requests")
    .select("id, start_date, end_date, status")
    .eq("org_id", orgId)
    .eq("payroll_profile_id", profile.id)
    .in("status", ["pending", "approved"]);

  const check = validateLeaveApplication({
    employeeActive: profile.employment_status === "active" || profile.employment_status === "on_leave",
    leaveTypeActive: leaveType.active,
    startIso: body.start_date,
    endIso: body.end_date,
    halfDay: Boolean(body.half_day),
    excludeWeekends: leaveType.exclude_weekends !== false,
    holidayIsos: body.holiday_isos,
    balance,
    unpaid: !leaveType.paid,
    overlapping: overlapping || [],
  });
  if (!check.ok) {
    const err = new Error(check.errors[0]);
    err.status = 400;
    err.details = check.errors;
    throw err;
  }

  const { data: request, error } = await insertLeaveRow(
    "leave_requests",
    withEmployeeId(
      {
        org_id: orgId,
        payroll_profile_id: profile.id,
        user_id: actorId,
        leave_type_id: leaveType.id,
        start_date: body.start_date,
        end_date: body.end_date,
        half_day: Boolean(body.half_day),
        working_days: check.workingDays,
        reason: body.reason || null,
        attachment_url: body.attachment_url || null,
        status: "pending",
        submitted_at: new Date().toISOString(),
      },
      profile
    )
  );
  if (error) throw mapLeaveDbError(error);

  if (leaveType.paid) {
    const nextPending = Number(balance.pending) + check.workingDays;
    await supabaseAdmin
      .from("leave_balances")
      .update({ pending: nextPending })
      .eq("id", balance.id);
    await insertLeaveRow(
      "leave_transactions",
      withEmployeeId(
        {
          org_id: orgId,
          payroll_profile_id: profile.id,
          leave_type_id: leaveType.id,
          leave_request_id: request.id,
          leave_year: year,
          kind: "pending_hold",
          days: -check.workingDays,
          balance_after: computeLeaveBalance({ ...balance, pending: nextPending }).available,
          reason: "Leave application submitted",
          actor_id: actorId,
        },
        profile
      )
    );
  }

  await writePayrollAudit({
    orgId,
    actorId,
    action: "LEAVE_SUBMITTED",
    recordType: "leave_requests",
    recordId: request.id,
  });
  try {
    const { emitWorkforceEvent, WORKFORCE_EVENT_TYPES } = await import("../workforce/workforceEvents.js");
    await emitWorkforceEvent({
      orgId,
      employeeId: employeeIdOfProfile(profile),
      eventType: WORKFORCE_EVENT_TYPES.LEAVE_APPLIED,
      actorId,
      payload: { leave_request_id: request.id },
      idempotencyKey: `leave:${request.id}:applied`,
    });
  } catch (err) {
    console.warn("[workforce] leave applied event failed:", err?.message || err);
  }
  await notifyUser(actorId, `Leave application submitted (${leaveType.name}, ${check.workingDays} day(s)).`);
  return { request, preview: check };
}

export async function listLeaveEmployees(orgId) {
  const { data: members, error } = await supabaseAdmin
    .from("memberships")
    .select(MEMBERSHIP_COLS)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw mapLeaveDbError(error);

  const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
  const { data: people } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, full_name, email, job_title, department").in("id", userIds)
    : { data: [] };
  const byUser = new Map((people || []).map((p) => [p.id, p]));

  const rows = [];
  for (const membership of members || []) {
    const employeeId = canonicalEmployeeId({ id: membership.id, employee_id: membership.id });
    if (!employeeId) continue;
    let profile = null;
    try {
      profile = await getOrCreateProfileForMembership(orgId, membership);
    } catch (err) {
      console.warn("[leave] payroll profile provision skipped:", err?.message || err);
    }
    const person = byUser.get(membership.user_id);
    const name =
      person?.full_name ||
      profile?.full_name ||
      membership.invited_email ||
      person?.email ||
      "Employee";
    rows.push({
      id: employeeId,
      employee_id: employeeId,
      membership_id: employeeId,
      payroll_profile_id: parseUuid(profile?.id),
      user_id: parseUuid(membership.user_id),
      employee_number: membership.employee_number || profile?.employee_number || null,
      full_name: name,
      email: person?.email || membership.invited_email || profile?.email || null,
      department: membership.department || profile?.department || person?.department || null,
      job_title: profile?.job_title || person?.job_title || null,
      employment_status: membership.employment_status || profile?.employment_status || "active",
    });
  }
  rows.sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
  return rows;
}

async function payrollProfileIdForEmployeeFilter(orgId, filters = {}) {
  const employeeId = parseUuid(filters.employee_id);
  if (employeeId) {
    const { data } = await supabaseAdmin
      .from("payroll_profiles")
      .select("id")
      .eq("org_id", orgId)
      .eq("membership_id", employeeId)
      .maybeSingle();
    return parseUuid(data?.id);
  }
  return parseUuid(filters.payroll_profile_id);
}

export async function listLeaveRequests(orgId, filters = {}) {
  let q = supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(name, code, paid), payroll_profiles(full_name, employee_number, department, email, membership_id)")
    .eq("org_id", orgId)
    .order("submitted_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  const profileId = await payrollProfileIdForEmployeeFilter(orgId, filters);
  const userId = parseUuid(filters.user_id);
  const leaveTypeId = parseUuid(filters.leave_type_id);
  if (parseUuid(filters.employee_id) && !profileId) {
    return [];
  }
  if (profileId) q = q.eq("payroll_profile_id", profileId);
  else if (userId) q = q.eq("user_id", userId);
  if (leaveTypeId) q = q.eq("leave_type_id", leaveTypeId);
  const { data, error } = await q.limit(500);
  if (error) throw mapLeaveDbError(error);
  const rows = data || [];
  const dept = String(filters.department || "").trim().toLowerCase();
  if (!dept) return rows;
  return rows.filter((row) => String(row.payroll_profiles?.department || "").toLowerCase() === dept);
}

export async function decideLeaveRequest(orgId, actorId, requestId, { approve, reason }) {
  const id = requireUuid(requestId, "leave request id");
  const actor = requireUuid(actorId, "user id");
  const { data: request } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(*), payroll_profiles(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    const err = new Error("Leave request not found.");
    err.status = 404;
    throw err;
  }
  if (request.status !== "pending") {
    const err = new Error("Only pending requests can be decided.");
    err.status = 409;
    throw err;
  }
  if (!approve && !String(reason || "").trim()) {
    const err = new Error("A rejection reason is required.");
    err.status = 400;
    throw err;
  }

  const year = leaveYearForDate(request.start_date);
  const { data: balance } = await supabaseAdmin
    .from("leave_balances")
    .select("*")
    .eq("payroll_profile_id", request.payroll_profile_id)
    .eq("leave_type_id", request.leave_type_id)
    .eq("leave_year", year)
    .maybeSingle();

  const days = Number(request.working_days) || 0;
  const paid = request.leave_types?.paid !== false;

  if (approve && paid && balance) {
    const next = {
      pending: Math.max(0, Number(balance.pending) - days),
      used: Number(balance.used) + days,
    };
    const computed = computeLeaveBalance({ ...balance, ...next });
    await supabaseAdmin.from("leave_balances").update(next).eq("id", balance.id);
    await supabaseAdmin.from("leave_transactions").insert([
      withEmployeeId(
        {
          org_id: orgId,
          payroll_profile_id: request.payroll_profile_id,
          leave_type_id: request.leave_type_id,
          leave_request_id: request.id,
          leave_year: year,
          kind: "pending_release",
          days,
          balance_after: computed.available,
          reason: "Pending hold released on approval",
          actor_id: actor,
        },
        request.payroll_profiles
      ),
      withEmployeeId(
        {
          org_id: orgId,
          payroll_profile_id: request.payroll_profile_id,
          leave_type_id: request.leave_type_id,
          leave_request_id: request.id,
          leave_year: year,
          kind: "approved_leave",
          days: -days,
          balance_after: computed.available,
          reason: "Leave approved",
          actor_id: actor,
        },
        request.payroll_profiles
      ),
    ]);
  } else if (!approve && paid && balance) {
    const nextPending = Math.max(0, Number(balance.pending) - days);
    const computed = computeLeaveBalance({ ...balance, pending: nextPending });
    await supabaseAdmin.from("leave_balances").update({ pending: nextPending }).eq("id", balance.id);
    await insertLeaveRow(
      "leave_transactions",
      withEmployeeId(
        {
          org_id: orgId,
          payroll_profile_id: request.payroll_profile_id,
          leave_type_id: request.leave_type_id,
          leave_request_id: request.id,
          leave_year: year,
          kind: "pending_release",
          days,
          balance_after: computed.available,
          reason: "Pending hold released on rejection",
          actor_id: actor,
        },
        request.payroll_profiles
      )
    );
  }

  const { data: updated, error } = await supabaseAdmin
    .from("leave_requests")
    .update({
      status: approve ? "approved" : "rejected",
      rejection_reason: approve ? null : String(reason).trim(),
      decided_at: new Date().toISOString(),
      decided_by: actor,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw mapLeaveDbError(error);

  await writePayrollAudit({
    orgId,
    actorId: actor,
    action: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    recordType: "leave_requests",
    recordId: id,
    metadata: { reason: reason || null },
  });
  try {
    const { emitWorkforceEvent, WORKFORCE_EVENT_TYPES } = await import("../workforce/workforceEvents.js");
    const { registerWorkforceSubscribers } = await import("../workforce/employeeProvisioning.js");
    registerWorkforceSubscribers();
    const membershipId = request.payroll_profiles?.membership_id || null;
    await emitWorkforceEvent({
      orgId,
      employeeId: membershipId,
      eventType: approve
        ? WORKFORCE_EVENT_TYPES.EMPLOYEE_LEAVE_APPROVED
        : WORKFORCE_EVENT_TYPES.EMPLOYEE_LEAVE_REJECTED,
      actorId: actor,
      payload: { leave_request_id: id },
      idempotencyKey: `leave:${id}:${approve ? "approved" : "rejected"}`,
    });
  } catch (err) {
    console.warn("[workforce] leave event failed:", err?.message || err);
  }

  const typeName = request.leave_types?.name || "Leave";
  if (request.user_id) {
    await notifyUser(
      request.user_id,
      approve
        ? `Your ${typeName} request was approved.`
        : `Your ${typeName} request was rejected: ${String(reason).trim()}`
    );
    const email = request.payroll_profiles?.email;
    if (email) {
      const html = approve
        ? `<p>Your ${escapeHtml(typeName)} request (${escapeHtml(request.start_date)} → ${escapeHtml(request.end_date)}) was approved.</p>`
        : `<p>Your ${escapeHtml(typeName)} request was rejected.</p><p>Reason: ${escapeHtml(reason)}</p>`;
      await sendHtmlEmail(
        email,
        approve ? `Leave approved — ${typeName}` : `Leave rejected — ${typeName}`,
        html,
        "Paidly"
      );
    }
  }
  return updated;
}

export async function cancelLeaveRequest(orgId, actorId, requestId, { asAdmin = false } = {}) {
  const id = requireUuid(requestId, "leave request id");
  const actor = requireUuid(actorId, "user id");
  const { data: request } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(*)")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!request) {
    const err = new Error("Leave request not found.");
    err.status = 404;
    throw err;
  }
  if (!asAdmin && request.user_id !== actor) {
    const err = new Error("You can only cancel your own leave request.");
    err.status = 403;
    throw err;
  }
  if (!["draft", "pending"].includes(request.status) && !asAdmin) {
    const err = new Error("Approved leave must be cancelled by a manager.");
    err.status = 409;
    throw err;
  }
  if (request.status === "cancelled") return request;

  const year = leaveYearForDate(request.start_date);
  const days = Number(request.working_days) || 0;
  const paid = request.leave_types?.paid !== false;
  const { data: balance } = await supabaseAdmin
    .from("leave_balances")
    .select("*")
    .eq("payroll_profile_id", request.payroll_profile_id)
    .eq("leave_type_id", request.leave_type_id)
    .eq("leave_year", year)
    .maybeSingle();

  if (paid && balance) {
    const patch = {};
    if (request.status === "pending") patch.pending = Math.max(0, Number(balance.pending) - days);
    if (request.status === "approved") patch.used = Math.max(0, Number(balance.used) - days);
    if (Object.keys(patch).length) {
      await supabaseAdmin.from("leave_balances").update(patch).eq("id", balance.id);
      await supabaseAdmin.from("leave_transactions").insert({
        org_id: orgId,
        payroll_profile_id: request.payroll_profile_id,
        leave_type_id: request.leave_type_id,
        leave_request_id: request.id,
        leave_year: year,
        kind: "reversal",
        days,
        balance_after: availableOf({ ...balance, ...patch }),
        reason: "Leave cancelled",
        actor_id: actor,
      });
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("leave_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString(), decided_by: actor })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw mapLeaveDbError(error);
  await writePayrollAudit({
    orgId,
    actorId: actor,
    action: "LEAVE_CANCELLED",
    recordType: "leave_requests",
    recordId: id,
  });
  if (request.user_id) await notifyUser(request.user_id, "A leave request was cancelled.");
  return updated;
}

export async function adjustLeaveBalance(orgId, actorId, body) {
  const days = Number(body.days);
  if (!Number.isFinite(days) || days === 0) {
    const err = new Error("Adjustment days are required.");
    err.status = 400;
    throw err;
  }
  if (!String(body.reason || "").trim()) {
    const err = new Error("Every adjustment must include a reason.");
    err.status = 400;
    throw err;
  }
  const leaveTypeId = requireUuid(body.leave_type_id, "leave type id");
  const actor = requireUuid(actorId, "user id");
  const employeeId = parseUuid(body.employee_id);
  let profile = null;
  if (employeeId) {
    profile = await getOrCreateProfileForEmployee(orgId, employeeId);
  } else {
    const profileId = requireUuid(body.payroll_profile_id, "employee id");
    const found = await supabaseAdmin
      .from("payroll_profiles")
      .select("*")
      .eq("org_id", orgId)
      .eq("id", profileId)
      .maybeSingle();
    profile = found.data;
  }
  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (!profile || !leaveType) {
    const err = new Error("Employee or leave type not found.");
    err.status = 404;
    throw err;
  }
  const year = Number(body.leave_year) || johannesburgYmd().year;
  const balance = await ensureBalanceRow({ orgId, profile, leaveType, year });
  const nextAccrued = Number(balance.accrued) + days;
  if (nextAccrued < 0) {
    const err = new Error("Adjustment would make accrued leave negative.");
    err.status = 400;
    throw err;
  }
  const computed = computeLeaveBalance({ ...balance, accrued: nextAccrued, maxBalance: leaveType.max_balance });
  await supabaseAdmin
    .from("leave_balances")
    .update({ accrued: computed.accrued })
    .eq("id", balance.id);
  await insertLeaveRow(
    "leave_transactions",
    withEmployeeId(
      {
        org_id: orgId,
        payroll_profile_id: profile.id,
        leave_type_id: leaveType.id,
        leave_year: year,
        kind: "adjustment",
        days,
        balance_after: computed.available,
        reason: String(body.reason).trim(),
        actor_id: actor,
      },
      profile
    )
  );
  await writePayrollAudit({
    orgId,
    actorId: actor,
    action: "LEAVE_BALANCE_ADJUSTED",
    recordType: "leave_balances",
    recordId: balance.id,
    metadata: { days, reason: body.reason },
  });
  return { ...computed, leave_type: leaveType, profile };
}

export async function leaveCalendar(orgId, { start, end } = {}) {
  const now = johannesburgYmd();
  const from = start || formatIsoDate(now.year, now.month, 1);
  const to = end || formatIsoDate(now.year, now.month, 28);
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("id, start_date, end_date, status, working_days, leave_types(name, code), payroll_profiles(full_name, employee_number, department)")
    .eq("org_id", orgId)
    .in("status", ["pending", "approved"])
    .lte("start_date", to)
    .gte("end_date", from);
  if (error) throw mapLeaveDbError(error);
  return (data || []).map((row) => ({
    id: row.id,
    employee: row.payroll_profiles?.full_name,
    employee_number: row.payroll_profiles?.employee_number,
    department: row.payroll_profiles?.department,
    leave_type: row.leave_types?.name,
    leave_code: row.leave_types?.code,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    days: row.working_days,
  }));
}

export async function upsertLeaveType(orgId, payload) {
  const row = {
    org_id: orgId,
    name: payload.name,
    code: String(payload.code || "").toUpperCase(),
    paid: payload.paid !== false,
    accrual_method: payload.accrual_method || "annual",
    days_per_year: Number(payload.days_per_year) || 0,
    max_balance: payload.max_balance == null ? null : Number(payload.max_balance),
    carry_over_days: Number(payload.carry_over_days) || 0,
    requires_approval: payload.requires_approval !== false,
    requires_attachment: Boolean(payload.requires_attachment),
    exclude_weekends: payload.exclude_weekends !== false,
    active: payload.active !== false,
    sort_order: Number(payload.sort_order) || 0,
  };
  if (!row.name || !row.code) {
    const err = new Error("Leave name and code are required.");
    err.status = 400;
    throw err;
  }
  if (payload.id) {
    const typeId = requireUuid(payload.id, "leave type id");
    const { data, error } = await supabaseAdmin
      .from("leave_types")
      .update(row)
      .eq("id", typeId)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error) throw mapLeaveDbError(error);
    return data;
  }
  const { data, error } = await supabaseAdmin.from("leave_types").insert(row).select("*").maybeSingle();
  if (error) throw mapLeaveDbError(error);
  return data;
}

export async function listLeaveTypes(orgId) {
  await ensureLeaveTypes(orgId);
  const { data, error } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw mapLeaveDbError(error);
  return data || [];
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { countWorkingDays };
