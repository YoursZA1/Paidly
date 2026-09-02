import { supabaseAdmin, writePayrollAudit, notifyUser } from "../payroll/payrollGate.js";
import { johannesburgYmd, leaveYearForDate, formatIsoDate } from "../../../shared/payroll/dates.js";
import { countWorkingDays, computeLeaveBalance, yearToDateAccrual } from "../../../shared/leave/leaveMath.js";
import { validateLeaveApplication } from "../../../shared/leave/validateLeave.js";
import { sendHtmlEmail } from "../sendInvoice.js";

const DEFAULT_LEAVE_TYPES = [
  { code: "ANNUAL", name: "Annual leave", paid: true, accrual_method: "monthly", days_per_year: 21, requires_approval: true, sort_order: 1 },
  { code: "SICK", name: "Sick leave", paid: true, accrual_method: "annual", days_per_year: 10, requires_approval: true, sort_order: 2 },
  { code: "FAMILY", name: "Family responsibility", paid: true, accrual_method: "annual", days_per_year: 3, requires_approval: true, sort_order: 3 },
  { code: "UNPAID", name: "Unpaid leave", paid: false, accrual_method: "none", days_per_year: 0, requires_approval: true, sort_order: 4 },
  { code: "STUDY", name: "Study leave", paid: true, accrual_method: "annual", days_per_year: 5, requires_approval: true, sort_order: 5 },
];

export async function ensureLeaveTypes(orgId) {
  const { data: existing } = await supabaseAdmin.from("leave_types").select("id").eq("org_id", orgId).limit(1);
  if (existing?.length) return;
  await supabaseAdmin.from("leave_types").insert(
    DEFAULT_LEAVE_TYPES.map((t) => ({
      org_id: orgId,
      ...t,
      exclude_weekends: true,
      active: true,
      carry_over_days: 0,
    }))
  );
}

async function getOrCreateProfile(orgId, userId) {
  const { data: existing } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing;

  const { data: membership } = await supabaseAdmin
    .from("memberships")
    .select("id, user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    const err = new Error("No payroll profile for this employee.");
    err.status = 400;
    throw err;
  }
  const { data: person } = await supabaseAdmin
    .from("profiles")
    .select("full_name, first_name, last_name, email, job_title, department")
    .eq("id", userId)
    .maybeSingle();
  const name = person?.full_name || [person?.first_name, person?.last_name].filter(Boolean).join(" ") || person?.email || "Employee";
  const { count } = await supabaseAdmin
    .from("payroll_profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  const number = `EMP-${String((count || 0) + 1).padStart(3, "0")}`;
  const { data: created, error } = await supabaseAdmin
    .from("payroll_profiles")
    .insert({
      org_id: orgId,
      membership_id: membership.id,
      user_id: userId,
      employee_number: number,
      full_name: name,
      email: person?.email || null,
      job_title: person?.job_title || null,
      department: person?.department || null,
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return created;
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
  const row = {
    org_id: orgId,
    payroll_profile_id: profile.id,
    leave_type_id: leaveType.id,
    leave_year: year,
    entitled,
    accrued,
    used: 0,
    pending: 0,
  };
  const { data, error } = await supabaseAdmin.from("leave_balances").insert(row).select("*").maybeSingle();
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
  if (error) throw error;
  await supabaseAdmin.from("leave_transactions").insert({
    org_id: orgId,
    payroll_profile_id: profile.id,
    leave_type_id: leaveType.id,
    leave_year: year,
    kind: "opening",
    days: accrued,
    balance_after: accrued,
    reason: "Opening / year-to-date accrual",
  });
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
  const { data: requests } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(name, code)")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(100);
  return { profile, balances, requests: requests || [] };
}

export async function applyForLeave(orgId, userId, body) {
  await ensureLeaveTypes(orgId);
  const profile = await getOrCreateProfile(orgId, userId);
  if (profile.employment_status === "terminated" || profile.employment_status === "suspended") {
    const err = new Error("Inactive employees cannot apply for leave.");
    err.status = 400;
    throw err;
  }
  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", body.leave_type_id)
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

  const { data: request, error } = await supabaseAdmin
    .from("leave_requests")
    .insert({
      org_id: orgId,
      payroll_profile_id: profile.id,
      user_id: userId,
      leave_type_id: leaveType.id,
      start_date: body.start_date,
      end_date: body.end_date,
      half_day: Boolean(body.half_day),
      working_days: check.workingDays,
      reason: body.reason || null,
      attachment_url: body.attachment_url || null,
      status: "pending",
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error) throw error;

  if (leaveType.paid) {
    const nextPending = Number(balance.pending) + check.workingDays;
    await supabaseAdmin
      .from("leave_balances")
      .update({ pending: nextPending })
      .eq("id", balance.id);
    await supabaseAdmin.from("leave_transactions").insert({
      org_id: orgId,
      payroll_profile_id: profile.id,
      leave_type_id: leaveType.id,
      leave_request_id: request.id,
      leave_year: year,
      kind: "pending_hold",
      days: -check.workingDays,
      balance_after: computeLeaveBalance({ ...balance, pending: nextPending }).available,
      reason: "Leave application submitted",
      actor_id: userId,
    });
  }

  await writePayrollAudit({
    orgId,
    actorId: userId,
    action: "LEAVE_SUBMITTED",
    recordType: "leave_requests",
    recordId: request.id,
  });
  await notifyUser(userId, `Leave application submitted (${leaveType.name}, ${check.workingDays} day(s)).`);
  return { request, preview: check };
}

export async function listLeaveEmployees(orgId) {
  const { data, error } = await supabaseAdmin
    .from("payroll_profiles")
    .select("id, user_id, employee_number, full_name, department, employment_status")
    .eq("org_id", orgId)
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listLeaveRequests(orgId, filters = {}) {
  let q = supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(name, code, paid), payroll_profiles(full_name, employee_number, department, email)")
    .eq("org_id", orgId)
    .order("submitted_at", { ascending: false });
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.user_id) q = q.eq("user_id", filters.user_id);
  if (filters.leave_type_id) q = q.eq("leave_type_id", filters.leave_type_id);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  const rows = data || [];
  const dept = String(filters.department || "").trim().toLowerCase();
  if (!dept) return rows;
  return rows.filter((row) => String(row.payroll_profiles?.department || "").toLowerCase() === dept);
}

export async function decideLeaveRequest(orgId, actorId, requestId, { approve, reason }) {
  const { data: request } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(*), payroll_profiles(*)")
    .eq("org_id", orgId)
    .eq("id", requestId)
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
        actor_id: actorId,
      },
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
        actor_id: actorId,
      },
    ]);
  } else if (!approve && paid && balance) {
    const nextPending = Math.max(0, Number(balance.pending) - days);
    const computed = computeLeaveBalance({ ...balance, pending: nextPending });
    await supabaseAdmin.from("leave_balances").update({ pending: nextPending }).eq("id", balance.id);
    await supabaseAdmin.from("leave_transactions").insert({
      org_id: orgId,
      payroll_profile_id: request.payroll_profile_id,
      leave_type_id: request.leave_type_id,
      leave_request_id: request.id,
      leave_year: year,
      kind: "pending_release",
      days,
      balance_after: computed.available,
      reason: "Pending hold released on rejection",
      actor_id: actorId,
    });
  }

  const { data: updated, error } = await supabaseAdmin
    .from("leave_requests")
    .update({
      status: approve ? "approved" : "rejected",
      rejection_reason: approve ? null : String(reason).trim(),
      decided_at: new Date().toISOString(),
      decided_by: actorId,
    })
    .eq("id", requestId)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  await writePayrollAudit({
    orgId,
    actorId,
    action: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    recordType: "leave_requests",
    recordId: requestId,
    metadata: { reason: reason || null },
  });

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
  const { data: request } = await supabaseAdmin
    .from("leave_requests")
    .select("*, leave_types(*)")
    .eq("org_id", orgId)
    .eq("id", requestId)
    .maybeSingle();
  if (!request) {
    const err = new Error("Leave request not found.");
    err.status = 404;
    throw err;
  }
  if (!asAdmin && request.user_id !== actorId) {
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
        actor_id: actorId,
      });
    }
  }

  const { data: updated, error } = await supabaseAdmin
    .from("leave_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString(), decided_by: actorId })
    .eq("id", requestId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  await writePayrollAudit({
    orgId,
    actorId,
    action: "LEAVE_CANCELLED",
    recordType: "leave_requests",
    recordId: requestId,
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
  const { data: profile } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", body.payroll_profile_id)
    .maybeSingle();
  const { data: leaveType } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", body.leave_type_id)
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
  await supabaseAdmin.from("leave_transactions").insert({
    org_id: orgId,
    payroll_profile_id: profile.id,
    leave_type_id: leaveType.id,
    leave_year: year,
    kind: "adjustment",
    days,
    balance_after: computed.available,
    reason: String(body.reason).trim(),
    actor_id: actorId,
  });
  await writePayrollAudit({
    orgId,
    actorId,
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
  if (error) throw error;
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
    const { data, error } = await supabaseAdmin
      .from("leave_types")
      .update(row)
      .eq("id", payload.id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseAdmin.from("leave_types").insert(row).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function listLeaveTypes(orgId) {
  await ensureLeaveTypes(orgId);
  const { data, error } = await supabaseAdmin
    .from("leave_types")
    .select("*")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
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
