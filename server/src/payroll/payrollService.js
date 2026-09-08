import crypto from "node:crypto";
import { supabaseAdmin, writePayrollAudit, notifyUser } from "./payrollGate.js";
import { calculatePayroll, selectStatutoryRules } from "../../../shared/payroll/calculatePayroll.js";
import { unpaidLeaveDaysInPeriod } from "../../../shared/payroll/unpaidLeaveImpact.js";
import { buildPayslipNumber } from "../../../shared/payroll/payslipNumber.js";
import { johannesburgYmd, monthBounds, monthLabel } from "../../../shared/payroll/dates.js";
import { countWorkingDays } from "../../../shared/leave/leaveMath.js";
import { PAY_RUN_STATUSES } from "../../../shared/payroll/constants.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { sendPayslipEmail, recordPayslipCreatedEvent } from "../documents/documentSendAdapter.js";

const DEFAULT_COMPONENTS = [
  { kind: "earning", code: "ALLOWANCE", name: "Allowance", taxable: true, recurring: true },
  { kind: "earning", code: "TRAVEL", name: "Travel allowance", taxable: true, recurring: true },
  { kind: "earning", code: "HOUSING", name: "Housing allowance", taxable: true, recurring: true },
  { kind: "earning", code: "BONUS", name: "Bonus", taxable: true, recurring: false },
  { kind: "earning", code: "COMMISSION", name: "Commission", taxable: true, recurring: false },
  { kind: "deduction", code: "PENSION", name: "Retirement contribution", type: "pension", recurring: true },
  { kind: "deduction", code: "MEDICAL", name: "Medical contribution", type: "medical", recurring: true },
  { kind: "deduction", code: "LOAN", name: "Loan repayment", recurring: false },
  { kind: "deduction", code: "ADVANCE", name: "Advance", recurring: false },
];

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function periodFromBody(body = {}) {
  const now = johannesburgYmd();
  let year = Number(body.year) || now.year;
  let month = Number(body.month) || now.month;
  if (body.period_start && body.period_end) {
    return {
      start: String(body.period_start).slice(0, 10),
      end: String(body.period_end).slice(0, 10),
      label: body.period_label || `${body.period_start} – ${body.period_end}`,
    };
  }
  const bounds = monthBounds(year, month);
  return { start: bounds.start, end: bounds.end, label: body.period_label || monthLabel(year, month) };
}

export async function ensurePayrollDefaults(orgId) {
  const { data: existing } = await supabaseAdmin
    .from("payroll_component_types")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (existing?.length) return;
  const rows = DEFAULT_COMPONENTS.map((c, i) => ({
    org_id: orgId,
    kind: c.kind,
    code: c.code,
    name: c.name,
    calculation_type: "fixed",
    taxable: c.taxable !== false,
    recurring: Boolean(c.recurring),
    tax_treatment: "standard",
    default_amount: 0,
    active: true,
    sort_order: i,
  }));
  await supabaseAdmin.from("payroll_component_types").insert(rows);
}

async function loadStatutoryRules(orgId, onIso) {
  const { data: platform } = await supabaseAdmin
    .from("payroll_statutory_rules")
    .select("*")
    .is("org_id", null);
  const { data: orgRules } = await supabaseAdmin
    .from("payroll_statutory_rules")
    .select("*")
    .eq("org_id", orgId);
  return selectStatutoryRules([...(platform || []), ...(orgRules || [])], onIso);
}

async function listMemberships(orgId) {
  let query = supabaseAdmin
    .from("memberships")
    .select("id, org_id, user_id, role, job_function, disabled_at")
    .eq("org_id", orgId);
  const { data, error } = await query;
  if (error && /disabled_at/i.test(error.message || "")) {
    const retry = await supabaseAdmin
      .from("memberships")
      .select("id, org_id, user_id, role, job_function")
      .eq("org_id", orgId);
    if (retry.error) throw retry.error;
    return retry.data || [];
  }
  if (error) throw error;
  return (data || []).filter((row) => !row.disabled_at);
}

function isMissingAuthUserFk(error) {
  const msg = String(error?.message || "");
  return error?.code === "23503" || /payroll_profiles_user_id_fkey|foreign key constraint/i.test(msg);
}

/**
 * memberships.user_id can be an orphan (no auth.users row). Do not fail the
 * whole payroll load — store the membership and drop the invalid user link.
 */
export async function insertPayrollProfileRow(row) {
  const first = await supabaseAdmin.from("payroll_profiles").insert(row).select("*").maybeSingle();
  if (!first.error) return first.data;
  if (isMissingAuthUserFk(first.error) && row.user_id) {
    const retry = await supabaseAdmin
      .from("payroll_profiles")
      .insert({ ...row, user_id: null })
      .select("*")
      .maybeSingle();
    if (!retry.error) return retry.data;
    if (!/duplicate|unique/i.test(retry.error.message || "")) throw retry.error;
    return null;
  }
  if (!/duplicate|unique/i.test(first.error.message || "")) throw first.error;
  return null;
}

export async function syncPayrollProfiles(orgId) {
  await ensurePayrollDefaults(orgId);
  const members = await listMemberships(orgId);
  const { data: existing } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("org_id", orgId);
  const byMembership = new Map((existing || []).map((p) => [p.membership_id, p]));
  const byUser = new Map(
    (existing || []).filter((p) => p.user_id).map((p) => [p.user_id, p])
  );

  const missingIds = [];
  for (const member of members) {
    if (byMembership.has(member.id)) continue;
    if (member.user_id && byUser.has(member.user_id)) continue;
    missingIds.push(member.id);
  }
  if (missingIds.length) {
    const { provisionEmployeeWorkforce, registerWorkforceSubscribers } = await import(
      "../workforce/employeeProvisioning.js"
    );
    registerWorkforceSubscribers();
    for (const employeeId of missingIds) {
      await provisionEmployeeWorkforce(orgId, employeeId);
    }
  }

  const { data: profiles } = await supabaseAdmin
    .from("payroll_profiles")
    .select("*")
    .eq("org_id", orgId)
    .order("employee_number", { ascending: true });
  return profiles || [];
}

export async function payrollOverview(orgId) {
  const profiles = await syncPayrollProfiles(orgId);
  const now = johannesburgYmd();
  const bounds = monthBounds(now.year, now.month);
  const { data: runs } = await supabaseAdmin
    .from("pay_runs")
    .select("*")
    .eq("org_id", orgId)
    .order("period_start", { ascending: false })
    .limit(12);
  const current =
    (runs || []).find(
      (r) => r.period_start <= bounds.end && r.period_end >= bounds.start && r.status !== "cancelled"
    ) || (runs || [])[0] || null;
  const { count: pendingCount } = await supabaseAdmin
    .from("pay_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("status", ["draft", "processing", "calculated", "awaiting_approval"]);
  const { count: completedCount } = await supabaseAdmin
    .from("pay_runs")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "paid");

  return {
    employees: profiles.filter((p) => p.payroll_status === "active" && p.employment_status !== "terminated").length,
    current_period: { label: monthLabel(now.year, now.month), ...bounds },
    current_run: current,
    runs: runs || [],
    pending_payroll: pendingCount || 0,
    completed_payroll: completedCount || 0,
    gross_payroll: money(current?.gross_total),
    total_deductions: money(current?.deductions_total),
    total_net: money(current?.net_total),
  };
}

export async function upsertPayrollProfile(orgId, actorId, payload) {
  const id = payload.id || null;
  if (payload.org_id && payload.org_id !== orgId) {
    const err = new Error("org_id cannot be supplied by the client");
    err.status = 403;
    throw err;
  }
  if (payload.membership_id) {
    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("id, user_id")
      .eq("id", payload.membership_id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!membership?.id) {
      const err = new Error("membership_id is not in your company");
      err.status = 403;
      throw err;
    }
    if (payload.user_id && membership.user_id && payload.user_id !== membership.user_id) {
      const err = new Error("user_id does not match this employee");
      err.status = 403;
      throw err;
    }
  }
  const patch = {
    org_id: orgId,
    membership_id: payload.membership_id,
    user_id: payload.user_id || null,
    employee_number: payload.employee_number || null,
    full_name: payload.full_name || null,
    email: payload.email || null,
    job_title: payload.job_title || null,
    department: payload.department || null,
    employment_status: payload.employment_status || "active",
    employment_start_date: payload.employment_start_date || null,
    pay_frequency: payload.pay_frequency || "monthly",
    pay_type: payload.pay_type || "monthly_salary",
    base_salary: money(payload.base_salary),
    hourly_rate: money(payload.hourly_rate),
    daily_rate: money(payload.daily_rate),
    banking: payload.banking && typeof payload.banking === "object" ? payload.banking : {},
    tax_identifiers:
      payload.tax_identifiers && typeof payload.tax_identifiers === "object" ? payload.tax_identifiers : {},
    payroll_status: payload.payroll_status || "active",
    notes: payload.notes || null,
  };
  let row;
  if (id) {
    const { data, error } = await supabaseAdmin
      .from("payroll_profiles")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error && isMissingAuthUserFk(error) && patch.user_id) {
      const retry = await supabaseAdmin
        .from("payroll_profiles")
        .update({ ...patch, user_id: null })
        .eq("id", id)
        .eq("org_id", orgId)
        .select("*")
        .maybeSingle();
      if (retry.error) throw retry.error;
      row = retry.data;
    } else if (error) {
      throw error;
    } else {
      row = data;
    }
  } else {
    row = await insertPayrollProfileRow(patch);
    if (!row) throw new Error("Could not save payroll profile.");
  }
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAYROLL_PROFILE_UPDATED",
    recordType: "payroll_profiles",
    recordId: row?.id,
  });
  return row;
}

function previewFromPayRunItem(item, run) {
  const paye = (item.statutory_deductions || []).find((d) => String(d.code).toUpperCase() === "PAYE");
  const uif = (item.statutory_deductions || []).find((d) => String(d.code).toUpperCase() === "UIF");
  return {
    source: "pay_run_item",
    pay_run_id: run.id,
    pay_run_item_id: item.id,
    period_label: run.period_label,
    locked: Boolean(run.finalized_at),
    basic: item.base_pay,
    overtime_pay: item.overtime_amount,
    overtime_hours: item.overtime_hours,
    overtime_rate: item.overtime_rate,
    earnings: item.earnings || [],
    other_deductions: item.other_deductions || [],
    statutory_deductions: item.statutory_deductions || [],
    gross_pay: item.gross_pay,
    taxable_income: item.taxable_income,
    total_deductions: item.total_deductions,
    net_pay: item.net_pay,
    tax_deduction: paye?.amount || 0,
    uif_deduction: uif?.amount || 0,
    unpaid_leave_days: item.unpaid_leave_days || 0,
    unpaid_leave_amount: item.unpaid_leave_amount || 0,
    warnings: item.warnings || [],
    breakdown: item.calculation || {},
  };
}

export async function previewCalculation(orgId, payload) {
  const membershipId = parseUuid(payload.membership_id || payload.employee_id);
  if (membershipId && payload.period_start && payload.period_end) {
    const found = await findPayRunItemForEmployeePeriod(
      orgId,
      membershipId,
      payload.period_start,
      payload.period_end
    );
    if (found?.item && Number(found.item.net_pay) > 0) {
      return previewFromPayRunItem(found.item, found.run);
    }
  }
  const rules = await loadStatutoryRules(orgId, payload.period_end || johannesburgYmd().iso);
  return {
    source: "preview",
    ...calculatePayroll({
      profile: payload.profile || {},
      earnings: payload.earnings || [],
      deductions: payload.deductions || [],
      statutoryRules: rules,
      overtimeHours: payload.overtime_hours,
      overtimeRate: payload.overtime_rate,
      extras: payload.extras || {},
    }),
  };
}

async function loadRecurringComponents(orgId) {
  const { data } = await supabaseAdmin
    .from("payroll_component_types")
    .select("*")
    .eq("org_id", orgId)
    .eq("active", true)
    .eq("recurring", true);
  return data || [];
}

function eligibleProfile(profile) {
  return (
    profile.payroll_status === "active" &&
    profile.employment_status !== "terminated" &&
    profile.employment_status !== "suspended"
  );
}

function payRunItemInsert(orgId, runId, profile) {
  return {
    org_id: orgId,
    pay_run_id: runId,
    payroll_profile_id: profile.id,
    membership_id: profile.membership_id,
    user_id: profile.user_id,
    employee_number: profile.employee_number,
    employee_name: profile.full_name,
    status: "pending",
  };
}

const OPEN_PAY_RUN_STATUSES = new Set(["draft", "processing", "calculated"]);

/**
 * Add newly eligible employees to an open pay run. Does not remove existing items
 * and never mutates finalized / approved / paid runs.
 */
export async function syncPayRunEmployees(orgId, runId) {
  const run = await getPayRun(orgId, runId);
  if (run.finalized_at || !OPEN_PAY_RUN_STATUSES.has(run.status)) {
    return run;
  }
  const profiles = (await syncPayrollProfiles(orgId)).filter(eligibleProfile);
  const existing = new Set((run.items || []).map((item) => item.payroll_profile_id));
  const missing = profiles.filter((profile) => profile.id && !existing.has(profile.id));
  if (missing.length) {
    const { error } = await supabaseAdmin
      .from("pay_run_items")
      .insert(missing.map((profile) => payRunItemInsert(orgId, run.id, profile)));
    if (error && !/duplicate|unique/i.test(error.message || "")) throw error;
  }
  const nextCount = (run.items || []).length + missing.length;
  if (missing.length || run.employee_count !== nextCount) {
    await supabaseAdmin.from("pay_runs").update({ employee_count: nextCount }).eq("id", run.id);
  }
  return getPayRun(orgId, runId);
}

export async function findPayRunItemForEmployeePeriod(orgId, membershipId, periodStart, periodEnd) {
  if (!membershipId || !periodStart || !periodEnd) return null;
  const { data: items, error } = await supabaseAdmin
    .from("pay_run_items")
    .select("*, pay_runs!inner(id, org_id, period_start, period_end, period_label, status, finalized_at)")
    .eq("org_id", orgId)
    .eq("membership_id", membershipId);
  if (error) {
    console.warn("[payroll] pay-run item lookup failed:", error.message);
    return null;
  }
  const match = (items || []).find((item) => {
    const run = item.pay_runs;
    if (!run || run.status === "cancelled") return false;
    return run.period_start === periodStart && run.period_end === periodEnd;
  });
  if (!match) return null;
  const { pay_runs: run, ...item } = match;
  return { item, run };
}

async function unpaidLeaveRequestsByProfile(orgId, periodStart, periodEnd, profileIds) {
  const ids = (profileIds || []).filter(Boolean);
  const map = new Map();
  if (!ids.length) return map;
  const { data, error } = await supabaseAdmin
    .from("leave_requests")
    .select("payroll_profile_id, start_date, end_date, half_day, status, leave_types(paid, exclude_weekends)")
    .eq("org_id", orgId)
    .eq("status", "approved")
    .lte("start_date", periodEnd)
    .gte("end_date", periodStart)
    .in("payroll_profile_id", ids);
  if (error) {
    console.warn("[payroll] unpaid leave lookup failed:", error.message);
    return map;
  }
  for (const row of data || []) {
    const list = map.get(row.payroll_profile_id) || [];
    list.push(row);
    map.set(row.payroll_profile_id, list);
  }
  return map;
}

export async function createPayRun(orgId, actorId, body) {
  const period = periodFromBody(body);
  const frequency = String(body.frequency || "monthly");
  const runType = String(body.run_type || "regular");
  const insert = {
    org_id: orgId,
    period_label: period.label,
    period_start: period.start,
    period_end: period.end,
    pay_date: body.pay_date || period.end,
    frequency,
    run_type: runType,
    original_pay_run_id: body.original_pay_run_id || null,
    status: "draft",
    created_by: actorId,
  };
  const { data, error } = await supabaseAdmin.from("pay_runs").insert(insert).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const err = new Error("A payroll run already exists for this period.");
      err.status = 409;
      throw err;
    }
    throw error;
  }

  const profiles = (await syncPayrollProfiles(orgId)).filter(eligibleProfile);
  if (profiles.length) {
    const items = profiles.map((p) => payRunItemInsert(orgId, data.id, p));
    const { error: itemErr } = await supabaseAdmin.from("pay_run_items").insert(items);
    if (itemErr) throw itemErr;
  }
  await supabaseAdmin.from("pay_runs").update({ employee_count: profiles.length }).eq("id", data.id);
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_CREATED",
    recordType: "pay_runs",
    recordId: data.id,
    metadata: { period: period.label },
  });
  try {
    const { emitWorkforceEvent, WORKFORCE_EVENT_TYPES } = await import("../workforce/workforceEvents.js");
    await emitWorkforceEvent({
      orgId,
      eventType: WORKFORCE_EVENT_TYPES.PAYROLL_CREATED,
      actorId,
      payload: { pay_run_id: data.id, period: period.label },
      idempotencyKey: `payrun:${data.id}:created`,
    });
  } catch (err) {
    console.warn("[workforce] payroll created event failed:", err?.message || err);
  }
  return getPayRun(orgId, data.id);
}

export async function getPayRun(orgId, runId) {
  const { data: run, error } = await supabaseAdmin
    .from("pay_runs")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", runId)
    .maybeSingle();
  if (error) throw error;
  if (!run) {
    const err = new Error("Pay run not found");
    err.status = 404;
    throw err;
  }
  const { data: items } = await supabaseAdmin
    .from("pay_run_items")
    .select("*")
    .eq("pay_run_id", runId)
    .order("employee_name", { ascending: true });
  return { ...run, items: items || [] };
}

export async function calculatePayRun(orgId, actorId, runId, body = {}) {
  const run = await syncPayRunEmployees(orgId, runId);
  if (run.status === "cancelled" || run.status === "paid") {
    const err = new Error("This pay run cannot be recalculated.");
    err.status = 409;
    throw err;
  }
  if (run.finalized_at) {
    const err = new Error("Finalized payroll cannot be recalculated. Create an adjustment run.");
    err.status = 409;
    throw err;
  }
  await supabaseAdmin.from("pay_runs").update({ status: "processing" }).eq("id", runId);

  const rules = await loadStatutoryRules(orgId, run.period_end);
  const components = await loadRecurringComponents(orgId);
  const profileIds = (run.items || []).map((i) => i.payroll_profile_id);
  const { data: profiles } = await supabaseAdmin.from("payroll_profiles").select("*").in("id", profileIds);
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));
  const overrides = Array.isArray(body.items) ? body.items : [];
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const workingDaysInPeriod = countWorkingDays(run.period_start, run.period_end);
  const leaveByProfile = await unpaidLeaveRequestsByProfile(orgId, run.period_start, run.period_end, profileIds);

  let grossTotal = 0;
  let dedTotal = 0;
  let netTotal = 0;

  for (const item of run.items || []) {
    const profile = profileById.get(item.payroll_profile_id) || {};
    const over = overrideById.get(item.id) || {};
    const recurringEarnings = components
      .filter((c) => c.kind === "earning" && Number(c.default_amount) > 0)
      .map((c) => ({
        code: c.code,
        name: c.name,
        type: c.code.toLowerCase(),
        amount: c.default_amount,
        taxable: c.taxable,
        recurring: true,
      }));
    const recurringDeductions = components
      .filter((c) => c.kind === "deduction" && Number(c.default_amount) > 0)
      .map((c) => ({
        code: c.code,
        name: c.name,
        type: String(c.code).toLowerCase(),
        amount: c.default_amount,
        recurring: true,
      }));
    const result = calculatePayroll({
      profile,
      earnings: over.earnings || item.earnings || recurringEarnings,
      deductions: over.deductions || item.deductions || recurringDeductions,
      statutoryRules: rules,
      overtimeHours: over.overtime_hours ?? item.overtime_hours,
      overtimeRate: over.overtime_rate ?? item.overtime_rate,
      extras: {
        unpaid_leave_days: unpaidLeaveDaysInPeriod({
          periodStart: run.period_start,
          periodEnd: run.period_end,
          requests: leaveByProfile.get(item.payroll_profile_id) || [],
        }),
        working_days_in_period: workingDaysInPeriod,
      },
    });
    grossTotal += result.gross_pay;
    dedTotal += result.total_deductions;
    netTotal += result.net_pay;
    const snapshotUpdate = {
      employee_number: profile.employee_number || item.employee_number,
      employee_name: profile.full_name || item.employee_name,
      membership_id: profile.membership_id || item.membership_id,
      status: "calculated",
      base_pay: result.basic,
      overtime_hours: over.overtime_hours ?? item.overtime_hours,
      overtime_rate: over.overtime_rate ?? item.overtime_rate,
      overtime_amount: result.overtime_pay,
      earnings: result.earnings,
      deductions: result.other_deductions,
      gross_pay: result.gross_pay,
      taxable_income: result.taxable_income,
      statutory_deductions: result.statutory_deductions,
      other_deductions: result.other_deductions,
      total_deductions: result.total_deductions,
      net_pay: result.net_pay,
      calculation: {
        ...result.breakdown,
        profile_snapshot: {
          membership_id: profile.membership_id,
          base_salary: profile.base_salary,
          pay_frequency: profile.pay_frequency,
          pay_type: profile.pay_type,
          tax_identifiers: profile.tax_identifiers || {},
        },
      },
      warnings: result.warnings,
      base_salary_snapshot: money(profile.base_salary),
      unpaid_leave_days: result.unpaid_leave_days,
      unpaid_leave_amount: result.unpaid_leave_amount,
    };
    const { error } = await supabaseAdmin.from("pay_run_items").update(snapshotUpdate).eq("id", item.id);
    if (error && /base_salary_snapshot|unpaid_leave/i.test(error.message || "")) {
      delete snapshotUpdate.base_salary_snapshot;
      delete snapshotUpdate.unpaid_leave_days;
      delete snapshotUpdate.unpaid_leave_amount;
      const retry = await supabaseAdmin.from("pay_run_items").update(snapshotUpdate).eq("id", item.id);
      if (retry.error) throw retry.error;
    } else if (error) {
      throw error;
    }
  }

  await supabaseAdmin
    .from("pay_runs")
    .update({
      status: "calculated",
      calculated_at: new Date().toISOString(),
      gross_total: money(grossTotal),
      deductions_total: money(dedTotal),
      net_total: money(netTotal),
      employee_count: (run.items || []).length,
    })
    .eq("id", runId);

  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_CALCULATED",
    recordType: "pay_runs",
    recordId: runId,
  });
  return getPayRun(orgId, runId);
}

export async function submitPayRunForApproval(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (run.status !== "calculated") {
    const err = new Error("Calculate payroll before sending it for approval.");
    err.status = 409;
    throw err;
  }
  await supabaseAdmin.from("pay_runs").update({ status: "awaiting_approval" }).eq("id", runId);
  return getPayRun(orgId, runId);
}

export async function approvePayRun(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (!["calculated", "awaiting_approval"].includes(run.status)) {
    const err = new Error("This pay run is not ready for approval.");
    err.status = 409;
    throw err;
  }
  await supabaseAdmin
    .from("pay_runs")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: actorId,
    })
    .eq("id", runId);
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_APPROVED",
    recordType: "pay_runs",
    recordId: runId,
  });
  return getPayRun(orgId, runId);
}

async function leaveSummaryForProfile(orgId, profileId) {
  if (!profileId) return [];
  const year = johannesburgYmd().year;
  const { data: balances } = await supabaseAdmin
    .from("leave_balances")
    .select("leave_type_id, entitled, accrued, used, pending")
    .eq("org_id", orgId)
    .eq("payroll_profile_id", profileId)
    .eq("leave_year", year);
  const typeIds = [...new Set((balances || []).map((b) => b.leave_type_id).filter(Boolean))];
  let types = [];
  if (typeIds.length) {
    const { data } = await supabaseAdmin.from("leave_types").select("id, name, code").in("id", typeIds);
    types = data || [];
  }
  const typeById = new Map(types.map((t) => [t.id, t]));
  return (balances || []).map((b) => {
    const type = typeById.get(b.leave_type_id);
    return {
      code: type?.code,
      name: type?.name,
      entitled: b.entitled,
      accrued: b.accrued,
      used: b.used,
      pending: b.pending,
      available: Math.round((Number(b.accrued) - Number(b.used) - Number(b.pending)) * 100) / 100,
    };
  });
}

export async function finalizePayRun(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (run.status !== "approved") {
    const err = new Error("Approve the pay run before generating payslips.");
    err.status = 409;
    throw err;
  }
  if (run.finalized_at) {
    const err = new Error("This pay run is already finalized.");
    err.status = 409;
    throw err;
  }

  const invalid = (run.items || []).filter(
    (item) => !item.employee_name || Number(item.net_pay) < 0 || !item.employee_number
  );
  if (invalid.length) {
    const err = new Error("Cannot finalize: one or more employees are missing required payroll data.");
    err.status = 400;
    err.details = invalid.map((i) => i.employee_name || i.id);
    throw err;
  }

  for (const item of run.items || []) {
    if (item.payslip_id) continue;
    const profile = (
      await supabaseAdmin.from("payroll_profiles").select("*").eq("id", item.payroll_profile_id).maybeSingle()
    ).data;
    const allowances = (item.earnings || []).filter((e) => e.code !== "BASIC" && e.type !== "basic");
    const number = buildPayslipNumber({
      periodStart: run.period_start,
      employeeNumber: item.employee_number,
    });
    const leaveSummary = await leaveSummaryForProfile(orgId, item.payroll_profile_id);
    const token = crypto.randomUUID();
    const payslipRow = {
      org_id: orgId,
      pay_run_id: run.id,
      pay_run_item_id: item.id,
      payroll_profile_id: item.payroll_profile_id,
      membership_id: item.membership_id || profile?.membership_id || null,
      payslip_number: number,
      employee_name: item.employee_name,
      employee_id: item.employee_number,
      employee_email: profile?.email || null,
      employee_user_id: item.user_id,
      position: profile?.job_title || null,
      department: profile?.department || null,
      pay_period_start: run.period_start,
      pay_period_end: run.period_end,
      pay_date: run.pay_date,
      basic_salary: item.base_pay,
      overtime_hours: item.overtime_hours,
      overtime_rate: item.overtime_rate,
      allowances,
      gross_pay: item.gross_pay,
      tax_deduction: (item.statutory_deductions || []).find((d) => String(d.code).toUpperCase() === "PAYE")?.amount || 0,
      uif_deduction: (item.statutory_deductions || []).find((d) => String(d.code).toUpperCase() === "UIF")?.amount || 0,
      pension_deduction: (item.other_deductions || []).find((d) => /pension|retirement/i.test(d.type || d.code || ""))?.amount || 0,
      medical_aid_deduction: (item.other_deductions || []).find((d) => /medical/i.test(d.type || d.code || ""))?.amount || 0,
      other_deductions: item.other_deductions || [],
      total_deductions: item.total_deductions,
      net_pay: item.net_pay,
      status: "draft",
      public_share_token: token,
      calculation_breakdown: item.calculation,
      leave_summary: leaveSummary,
      locked: true,
      finalized_at: new Date().toISOString(),
      created_by_id: actorId,
      user_id: actorId,
    };
    let { data: payslip, error } = await supabaseAdmin.from("payslips").insert(payslipRow).select("id").maybeSingle();
    if (error && payslipRow.membership_id && /membership_id/i.test(error.message || "")) {
      delete payslipRow.membership_id;
      const retry = await supabaseAdmin.from("payslips").insert(payslipRow).select("id").maybeSingle();
      payslip = retry.data;
      error = retry.error;
    }
    if (error) throw error;
    await recordPayslipCreatedEvent({ orgId, payslipId: payslip.id });
    await supabaseAdmin
      .from("pay_run_items")
      .update({ payslip_id: payslip.id, status: "payslip_generated" })
      .eq("id", item.id);
    await writePayrollAudit({
      orgId,
      actorId,
      action: "PAYSLIP_GENERATED",
      recordType: "payslips",
      recordId: payslip.id,
      metadata: { pay_run_id: run.id, payslip_number: number },
    });
    try {
      const { emitWorkforceEvent, WORKFORCE_EVENT_TYPES } = await import("../workforce/workforceEvents.js");
      await emitWorkforceEvent({
        orgId,
        employeeId: item.membership_id || profile?.membership_id || null,
        eventType: WORKFORCE_EVENT_TYPES.PAYSLIP_GENERATED,
        actorId,
        payload: { payslip_id: payslip.id, pay_run_id: run.id },
        idempotencyKey: `payslip:${payslip.id}:generated`,
      });
    } catch (err) {
      console.warn("[workforce] payslip generated event failed:", err?.message || err);
    }
    if (item.user_id) {
      await notifyUser(item.user_id, `Your Paidly payslip for ${run.period_label} is available.`);
    }
  }

  await supabaseAdmin
    .from("pay_runs")
    .update({ finalized_at: new Date().toISOString() })
    .eq("id", runId);

  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_FINALIZED",
    recordType: "pay_runs",
    recordId: runId,
  });
  try {
    const { emitWorkforceEvent, WORKFORCE_EVENT_TYPES } = await import("../workforce/workforceEvents.js");
    await emitWorkforceEvent({
      orgId,
      eventType: WORKFORCE_EVENT_TYPES.PAYROLL_PROCESSED,
      actorId,
      payload: { pay_run_id: runId },
      idempotencyKey: `payrun:${runId}:processed`,
    });
  } catch (err) {
    console.warn("[workforce] payroll processed event failed:", err?.message || err);
  }
  return getPayRun(orgId, runId);
}

export async function markPayRunPaid(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (!run.finalized_at) {
    const err = new Error("Finalize payroll and generate payslips before marking paid.");
    err.status = 409;
    throw err;
  }
  await supabaseAdmin
    .from("pay_runs")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", runId);
  await supabaseAdmin.from("payslips").update({ status: "paid" }).eq("pay_run_id", runId).eq("org_id", orgId);
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_PAID",
    recordType: "pay_runs",
    recordId: runId,
  });
  return getPayRun(orgId, runId);
}

export async function cancelPayRun(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (run.status === "paid" || run.finalized_at) {
    const err = new Error("Finalized or paid payroll cannot be cancelled. Create an adjustment run.");
    err.status = 409;
    throw err;
  }
  await supabaseAdmin
    .from("pay_runs")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", runId);
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAY_RUN_CANCELLED",
    recordType: "pay_runs",
    recordId: runId,
  });
  return getPayRun(orgId, runId);
}

export async function sendPayRunPayslips(orgId, actorId, runId, origin, options = {}) {
  const run = await getPayRun(orgId, runId);
  if (!run.finalized_at) {
    const err = new Error("Finalize payroll before sending payslips.");
    err.status = 409;
    throw err;
  }
  const { data: payslips } = await supabaseAdmin
    .from("payslips")
    .select("id, employee_name, employee_email, employee_user_id, public_share_token, payslip_number, status, sent_to_email")
    .eq("org_id", orgId)
    .eq("pay_run_id", runId);

  const base = String(origin || "").replace(/\/$/, "") || "https://www.paidly.co.za";
  const resend = Boolean(options.resend);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const slip of payslips || []) {
    const to = slip.employee_email;
    if (!to) continue;
    if (!resend && slip.status === "sent" && slip.sent_to_email) {
      skipped += 1;
      continue;
    }
    const token = slip.public_share_token || crypto.randomUUID();
    if (!slip.public_share_token) {
      await supabaseAdmin.from("payslips").update({ public_share_token: token }).eq("id", slip.id);
    }
    const sendAttempt = `${slip.id}:${runId}:${resend ? Date.now() : "send"}`;
    try {
      await sendPayslipEmail({
        to,
        employeeName: slip.employee_name,
        periodLabel: run.period_label,
        payslipNumber: slip.payslip_number,
        shareToken: token,
        origin: base,
        orgId,
        payslipId: slip.id,
        sendAttempt,
      });
    } catch (err) {
      failed += 1;
      await writePayrollAudit({
        orgId,
        actorId,
        action: "PAYSLIP_SEND_FAILED",
        recordType: "payslips",
        recordId: slip.id,
        metadata: { reason: err?.code || "EMAIL_PROVIDER_FAILED" },
      });
      continue;
    }
    await supabaseAdmin.from("payslips").update({ sent_to_email: to, status: "sent" }).eq("id", slip.id);
    await writePayrollAudit({
      orgId,
      actorId,
      action: "PAYSLIP_SENT",
      recordType: "payslips",
      recordId: slip.id,
    });
    if (slip.employee_user_id) {
      await notifyUser(slip.employee_user_id, `Your Paidly payslip for ${run.period_label} has been emailed.`);
    }
    sent += 1;
  }
  return { sent, skipped, failed, total: (payslips || []).length };
}

export async function listStatutoryRules(orgId) {
  const { data: platform } = await supabaseAdmin.from("payroll_statutory_rules").select("*").is("org_id", null);
  const { data: orgRules } = await supabaseAdmin.from("payroll_statutory_rules").select("*").eq("org_id", orgId);
  return { platform: platform || [], org: orgRules || [] };
}

export async function upsertStatutoryRule(orgId, actorId, payload) {
  const row = {
    org_id: orgId,
    code: String(payload.code || "").toUpperCase(),
    name: payload.name || payload.code,
    effective_from: payload.effective_from,
    effective_to: payload.effective_to || null,
    calculation_type: payload.calculation_type,
    value: payload.value || {},
    employee_portion: payload.employee_portion !== false,
    employer_portion: Boolean(payload.employer_portion),
  };
  if (!row.code || !row.effective_from || !row.calculation_type) {
    const err = new Error("code, effective_from, and calculation_type are required.");
    err.status = 400;
    throw err;
  }
  let result;
  if (payload.id) {
    const { data, error } = await supabaseAdmin
      .from("payroll_statutory_rules")
      .update(row)
      .eq("id", payload.id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    result = data;
  } else {
    const { data, error } = await supabaseAdmin.from("payroll_statutory_rules").insert(row).select("*").maybeSingle();
    if (error) throw error;
    result = data;
  }
  await writePayrollAudit({
    orgId,
    actorId,
    action: "STATUTORY_RULE_UPDATED",
    recordType: "payroll_statutory_rules",
    recordId: result?.id,
  });
  return result;
}

export { PAY_RUN_STATUSES };
