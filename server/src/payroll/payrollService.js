import crypto from "node:crypto";
import { supabaseAdmin, writePayrollAudit, notifyUser } from "./payrollGate.js";
import { calculatePayroll, selectStatutoryRules } from "../../../shared/payroll/calculatePayroll.js";
import { unpaidLeaveDaysInPeriod } from "../../../shared/payroll/unpaidLeaveImpact.js";
import { buildPayslipNumber } from "../../../shared/payroll/payslipNumber.js";
import { johannesburgYmd, monthBounds, monthLabel } from "../../../shared/payroll/dates.js";
import { countWorkingDays } from "../../../shared/leave/leaveMath.js";
import { PAY_RUN_STATUSES } from "../../../shared/payroll/constants.js";
import { parseUuid } from "../../../shared/ids/uuid.js";
import { payRunNeedsAdjustment } from "../../../shared/payroll/adjustmentRun.js";
import {
  leaveRowsByProfile,
  restoreStatusAfterFailedCalculate,
  shouldRetryCalculateWithoutReclaim,
} from "../../../shared/payroll/payRunLock.js";
import {
  assertAppendOnlyStatutoryPayload,
  statutoryVersionRow,
  supersedeEffectiveTo,
} from "../../../shared/payroll/statutoryVersion.js";
import { requirePayslipMembershipId } from "../../../shared/payroll/payslipWriteGuard.js";
import { claimPayRunForCalculate, commitPayRunCalculate } from "./payRunLockRpc.js";
import { sendPayslipEmail, recordPayslipCreatedEvent } from "../documents/documentSendAdapter.js";
import { loadOutstandingAdjustmentSignals } from "../workforce/adjustmentSignals.js";
import { throwIfMissingWorkforceColumn } from "../workforce/schemaGuard.js";
import { isPayrollParticipationActive } from "../../../shared/workforce/employeeLifecycle.js";
import { validatePayRunItem } from "../../../shared/payroll/payRunValidation.js";
import { canPublishPayslip, displayPayslipStatus, publishedPayslipWrite } from "../../../shared/payroll/payslipStatus.js";
import { buildEmployerSnapshot, mergeEmployerPayrollSettings, normalizeEmployerPayrollSettings } from "../../../shared/payroll/employerSnapshot.js";
import { buildEmployeePayslipSnapshot } from "../../../shared/payroll/employeeSnapshot.js";
import {
  PAYROLL_REPORT_TYPES,
  attachReportContext,
  buildPayrollReport,
  buildPayrollSummary,
  filterReportItems,
  payrollReportFilename,
  payrollReportToCsv,
} from "../../../shared/payroll/payrollReports.js";
import {
  RECONCILIATION_STATUS,
  reconcilePayrollPayment,
  salaryExpenseCandidates,
  sumAmounts,
} from "../../../shared/payroll/payrollReconciliation.js";

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
  const adjustment = await loadOutstandingAdjustmentSignals(orgId);

  return {
    employees: profiles.filter((p) => p.payroll_status === "active" && p.employment_status !== "terminated").length,
    current_period: { label: monthLabel(now.year, now.month), ...bounds },
    current_run: current,
    current_period_covered: Boolean(current?.finalized_at),
    runs: runs || [],
    pending_payroll: pendingCount || 0,
    completed_payroll: completedCount || 0,
    gross_payroll: money(current?.gross_total),
    total_deductions: money(current?.deductions_total),
    total_net: money(current?.net_total),
    needs_adjustment_run: adjustment.needs_adjustment_run,
    adjustment_signals: adjustment.signals,
  };
}

function hasOwn(payload, key) {
  return payload != null && Object.prototype.hasOwnProperty.call(payload, key);
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
  const patch = { org_id: orgId };
  if (hasOwn(payload, "membership_id")) patch.membership_id = payload.membership_id;
  if (hasOwn(payload, "user_id")) patch.user_id = payload.user_id || null;
  if (hasOwn(payload, "pay_frequency")) patch.pay_frequency = payload.pay_frequency || "monthly";
  if (hasOwn(payload, "pay_type")) patch.pay_type = payload.pay_type || "monthly_salary";
  if (hasOwn(payload, "base_salary")) patch.base_salary = money(payload.base_salary);
  if (hasOwn(payload, "hourly_rate")) patch.hourly_rate = money(payload.hourly_rate);
  if (hasOwn(payload, "daily_rate")) patch.daily_rate = money(payload.daily_rate);
  if (hasOwn(payload, "banking")) {
    patch.banking = payload.banking && typeof payload.banking === "object" ? payload.banking : {};
  }
  if (hasOwn(payload, "tax_identifiers")) {
    patch.tax_identifiers =
      payload.tax_identifiers && typeof payload.tax_identifiers === "object" ? payload.tax_identifiers : {};
  }
  if (hasOwn(payload, "payroll_status")) patch.payroll_status = payload.payroll_status || "active";
  if (hasOwn(payload, "notes")) patch.notes = payload.notes || null;
  if (!id) {
    if (!patch.pay_frequency) patch.pay_frequency = "monthly";
    if (!patch.pay_type) patch.pay_type = "monthly_salary";
    if (!patch.payroll_status) patch.payroll_status = "active";
  }
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
  return isPayrollParticipationActive(profile);
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
  const input = { ...body };
  const originalId = parseUuid(input.original_pay_run_id);
  if (originalId && (!input.period_start || !input.period_end)) {
    const { data: original } = await supabaseAdmin
      .from("pay_runs")
      .select("period_start, period_end, period_label, frequency, pay_date")
      .eq("id", originalId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (original) {
      input.period_start = input.period_start || original.period_start;
      input.period_end = input.period_end || original.period_end;
      input.period_label = input.period_label || `${original.period_label} adjustment`;
      input.frequency = input.frequency || original.frequency;
      input.pay_date = input.pay_date || original.pay_date;
    }
  }
  const period = periodFromBody(input);
  const frequency = String(input.frequency || "monthly");
  const runType = String(input.run_type || "regular");
  const insert = {
    org_id: orgId,
    period_label: period.label,
    period_start: period.start,
    period_end: period.end,
    pay_date: input.pay_date || period.end,
    frequency,
    run_type: runType,
    original_pay_run_id: originalId,
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
  const adjustment = await loadOutstandingAdjustmentSignals(orgId);
  return {
    ...run,
    items: items || [],
    needs_adjustment_run: payRunNeedsAdjustment(run.id, adjustment.signals),
  };
}

function buildPayRunItemSnapshot(item, profile, over, result) {
  return {
    id: item.id,
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
        employee_number: profile.employee_number || item.employee_number || null,
        department: profile.department || null,
        job_title: profile.job_title || null,
        employment_start_date: profile.employment_start_date || null,
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
}

async function writePayRunItemSnapshots(snapshots) {
  for (const snapshotUpdate of snapshots) {
    const { id, ...rest } = snapshotUpdate;
    const { error } = await supabaseAdmin.from("pay_run_items").update(rest).eq("id", id);
    if (error) {
      throwIfMissingWorkforceColumn(error, [
        "base_salary_snapshot",
        "unpaid_leave_days",
        "unpaid_leave_amount",
      ]);
      throw error;
    }
  }
}

async function releasePayRunCalculateClaim(orgId, runId, previousStatus, calculatedAt) {
  const restore = restoreStatusAfterFailedCalculate(previousStatus, calculatedAt);
  await supabaseAdmin
    .from("pay_runs")
    .update({ status: restore })
    .eq("id", runId)
    .eq("org_id", orgId)
    .eq("status", "processing");
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

  const previousStatus = run.status;
  const claim = await claimPayRunForCalculate(orgId, runId);
  if (claim.fallback) {
    await supabaseAdmin.from("pay_runs").update({ status: "processing" }).eq("id", runId);
  }

  try {
    let leaveSnapshot = claim;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await calculatePayRunOnce(orgId, actorId, run, body, leaveSnapshot);
      } catch (err) {
        if (shouldRetryCalculateWithoutReclaim(err, attempt)) {
          leaveSnapshot = {
            fallback: claim.fallback,
            reloadLeave: true,
            leave_fingerprint: err.leaveFingerprint || null,
          };
          continue;
        }
        throw err;
      }
    }
    const err = new Error("Leave changed during calculation. Try again.");
    err.status = 409;
    throw err;
  } catch (err) {
    await releasePayRunCalculateClaim(orgId, runId, previousStatus, run.calculated_at);
    throw err;
  }
}

async function calculatePayRunOnce(orgId, actorId, run, body = {}, leaveSnapshot = {}) {
  const runId = run.id;
  const rules = await loadStatutoryRules(orgId, run.period_end);
  const components = await loadRecurringComponents(orgId);
  const profileIds = (run.items || []).map((i) => i.payroll_profile_id);
  const { data: profiles } = await supabaseAdmin.from("payroll_profiles").select("*").in("id", profileIds);
  const profileById = new Map((profiles || []).map((p) => [p.id, p]));
  const overrides = Array.isArray(body.items) ? body.items : [];
  const overrideById = new Map(overrides.map((o) => [o.id, o]));
  const workingDaysInPeriod = countWorkingDays(run.period_start, run.period_end);
  const leaveByProfile =
    leaveSnapshot.fallback || leaveSnapshot.reloadLeave
      ? await unpaidLeaveRequestsByProfile(orgId, run.period_start, run.period_end, profileIds)
      : leaveRowsByProfile(leaveSnapshot.leave_rows);
  let leaveFingerprint = leaveSnapshot.leave_fingerprint;
  if (leaveSnapshot.reloadLeave && !leaveSnapshot.fallback) {
    const { data: fp, error: fpErr } = await supabaseAdmin.rpc("workforce_leave_overlap_fingerprint", {
      p_org_id: orgId,
      p_period_start: run.period_start,
      p_period_end: run.period_end,
    });
    if (!fpErr && fp) leaveFingerprint = fp;
  }

  let grossTotal = 0;
  let dedTotal = 0;
  let netTotal = 0;
  const snapshots = [];

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
    snapshots.push(buildPayRunItemSnapshot(item, profile, over, result));
  }

  if (!leaveSnapshot.fallback) {
    await commitPayRunCalculate(orgId, runId, {
      items: snapshots,
      leaveFingerprint: leaveFingerprint,
      grossTotal: money(grossTotal),
      deductionsTotal: money(dedTotal),
      netTotal: money(netTotal),
      employeeCount: (run.items || []).length,
    });
  } else {
    await writePayRunItemSnapshots(snapshots);
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
  }

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
  const submitted = await supabaseAdmin
    .from("pay_runs")
    .update({ status: "awaiting_approval", submitted_by: actorId })
    .eq("id", runId);
  if (submitted.error && /submitted_by/i.test(submitted.error.message || "")) {
    await supabaseAdmin.from("pay_runs").update({ status: "awaiting_approval" }).eq("id", runId);
  }
  return getPayRun(orgId, runId);
}

export async function approvePayRun(orgId, actorId, runId) {
  const run = await getPayRun(orgId, runId);
  if (!["calculated", "awaiting_approval"].includes(run.status)) {
    const err = new Error("This pay run is not ready for approval.");
    err.status = 409;
    throw err;
  }
  const selfApproved = run.created_by === actorId || run.submitted_by === actorId;
  if (selfApproved) {
    const { data: payrollAdmins } = await supabaseAdmin
      .from("memberships")
      .select("id, role, job_function")
      .eq("org_id", orgId)
      .in("role", ["admin", "owner", "manager"]);
    const admins = (payrollAdmins || []).filter((row) => {
      const role = String(row.role || "").toLowerCase();
      const fn = String(row.job_function || "").toLowerCase();
      return role === "admin" || role === "owner" || fn === "finance";
    });
    if (admins.length > 1) {
      const err = new Error("A different payroll admin must approve this pay run.");
      err.status = 409;
      err.code = "PAYROLL_SOD";
      throw err;
    }
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
    action: selfApproved ? "PAY_RUN_SELF_APPROVED" : "PAY_RUN_APPROVED",
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

export async function validatePayRun(orgId, runId) {
  const run = await getPayRun(orgId, runId);
  const membershipIds = [...new Set((run.items || []).map((item) => item.membership_id).filter(Boolean))];
  const { data: liveRows } = membershipIds.length
    ? await supabaseAdmin
        .from("payroll_profiles")
        .select("id, membership_id, base_salary, hourly_rate, daily_rate, pay_type, payroll_status, employment_status")
        .eq("org_id", orgId)
        .in("membership_id", membershipIds)
    : { data: [] };
  const liveByMembership = new Map((liveRows || []).map((row) => [row.membership_id, row]));
  const issues = [];
  for (const item of run.items || []) {
    if (!item.employee_name) issues.push({ employee: item.employee_number || item.id, message: "Missing employee name" });
    if (!item.employee_number) issues.push({ employee: item.employee_name || item.id, message: "Missing employee number" });
    if (Number(item.net_pay) < 0) issues.push({ employee: item.employee_name || item.id, message: "Negative net pay" });
    const live = liveByMembership.get(item.membership_id) || null;
    const rateIssue = validatePayRunItem(
      {
        ...item,
        full_name: item.employee_name,
        employee_id: item.membership_id,
      },
      live
    );
    if (rateIssue?.blocking) {
      issues.push({
        employee: rateIssue.name,
        membership_id: rateIssue.membership_id,
        message: rateIssue.message,
        setup_path: rateIssue.setup_path,
        code: rateIssue.code,
      });
    }
  }
  const { data: pendingLeave } = await supabaseAdmin
    .from("leave_requests")
    .select("id, employee_id, start_date, end_date")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .lte("start_date", run.period_end)
    .gte("end_date", run.period_start);
  return {
    ok: issues.length === 0,
    issues,
    pending_leave_overlapping: pendingLeave || [],
    item_count: (run.items || []).length,
    status: run.status,
  };
}

/**
 * Employer chrome for payslips/reports: organizations row (legal identity,
 * payroll refs) + the org owner's profile (logo / trading branding).
 */
async function loadEmployerBranding(orgId) {
  let { data: orgRow, error } = await supabaseAdmin
    .from("organizations")
    .select("name, registration_number, company_email, phone, address, payroll_settings, owner_id, logo_url")
    .eq("id", orgId)
    .maybeSingle();
  if (error && /logo_url/i.test(error.message || "")) {
    ({ data: orgRow } = await supabaseAdmin
      .from("organizations")
      .select("name, registration_number, company_email, phone, address, payroll_settings, owner_id")
      .eq("id", orgId)
      .maybeSingle());
  }
  let ownerProfile = null;
  if (orgRow?.owner_id) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("company_name, company_address, logo_url, currency")
      .eq("id", orgRow.owner_id)
      .maybeSingle();
    ownerProfile = data || null;
  }
  return { orgRow: orgRow || null, ownerProfile };
}

export async function finalizePayRun(orgId, actorId, runId, origin = "") {
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

  const { orgRow, ownerProfile } = await loadEmployerBranding(orgId);
  const employerSnapshot = buildEmployerSnapshot(orgRow || {}, ownerProfile);

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
    const membershipId = requirePayslipMembershipId({
      membership_id: item.membership_id || profile?.membership_id,
    });
    const payslipRow = {
      org_id: orgId,
      pay_run_id: run.id,
      pay_run_item_id: item.id,
      payroll_profile_id: item.payroll_profile_id,
      membership_id: membershipId,
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
      status: "published",
      public_share_token: token,
      calculation_breakdown: item.calculation,
      leave_summary: leaveSummary,
      employer_snapshot: employerSnapshot,
      employee_snapshot: buildEmployeePayslipSnapshot(profile || {}),
      locked: true,
      finalized_at: new Date().toISOString(),
      created_by_id: actorId,
      user_id: actorId,
    };
    const { data: payslip, error } = await supabaseAdmin.from("payslips").insert(payslipRow).select("id").maybeSingle();
    if (error) {
      throwIfMissingWorkforceColumn(error, ["membership_id", "employer_snapshot", "employee_snapshot"]);
      throw error;
    }
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

  let sendResult = null;
  try {
    sendResult = await sendPayRunPayslips(orgId, actorId, runId, origin);
  } catch (err) {
    console.warn("[payroll] auto-send after finalize failed:", err?.message || err);
    sendResult = { error: err?.message || String(err) };
  }
  const finalized = await getPayRun(orgId, runId);
  return { ...finalized, payslip_delivery: sendResult };
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

export async function publishPayslip(orgId, actorId, payslipId) {
  const id = parseUuid(payslipId);
  if (!id) {
    const err = new Error("Payslip id is required");
    err.status = 400;
    throw err;
  }
  const { data: slip, error } = await supabaseAdmin
    .from("payslips")
    .select("id, status, locked, pay_run_id, membership_id, payslip_number")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!slip?.id) {
    const err = new Error("Payslip not found");
    err.status = 404;
    throw err;
  }
  const current = displayPayslipStatus(slip);
  if (current === "sent" || current === "paid" || current === "published") {
    return { ...slip, status: current };
  }
  if (!canPublishPayslip(slip) && !slip.locked && !slip.pay_run_id) {
    const err = new Error("Only issued payslips can be published");
    err.status = 409;
    throw err;
  }
  const write = publishedPayslipWrite();
  const { data, error: updateError } = await supabaseAdmin
    .from("payslips")
    .update(write)
    .eq("id", slip.id)
    .eq("org_id", orgId)
    .select("id, status, locked, pay_run_id, membership_id, payslip_number")
    .maybeSingle();
  if (updateError) throw updateError;
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAYSLIP_PUBLISHED",
    recordType: "payslips",
    recordId: slip.id,
  });
  return data;
}

export async function sendEmployeePayslip(orgId, actorId, payslipId, origin = "") {
  const id = parseUuid(payslipId);
  if (!id) {
    const err = new Error("Payslip id is required");
    err.status = 400;
    throw err;
  }
  const { data: slip, error } = await supabaseAdmin
    .from("payslips")
    .select("id, employee_name, employee_email, employee_user_id, public_share_token, payslip_number, status, sent_to_email, pay_run_id, pay_period_start, pay_period_end")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!slip?.id) {
    const err = new Error("Payslip not found");
    err.status = 404;
    throw err;
  }
  const to = slip.employee_email;
  if (!to) {
    const err = new Error("This employee has no email on the payslip");
    err.status = 409;
    throw err;
  }
  const token = slip.public_share_token || crypto.randomUUID();
  if (!slip.public_share_token) {
    await supabaseAdmin.from("payslips").update({ public_share_token: token }).eq("id", slip.id);
  }
  const periodLabel = [slip.pay_period_start, slip.pay_period_end].filter(Boolean).join(" → ");
  const base = String(origin || "").replace(/\/$/, "") || "https://www.paidly.co.za";
  await sendPayslipEmail({
    to,
    employeeName: slip.employee_name,
    periodLabel,
    payslipNumber: slip.payslip_number,
    shareToken: token,
    origin: base,
    orgId,
    payslipId: slip.id,
    sendAttempt: `${slip.id}:profile:${Date.now()}`,
  });
  await supabaseAdmin.from("payslips").update({ sent_to_email: to, status: "sent" }).eq("id", slip.id);
  await writePayrollAudit({
    orgId,
    actorId,
    action: "PAYSLIP_SENT",
    recordType: "payslips",
    recordId: slip.id,
  });
  if (slip.employee_user_id) {
    await notifyUser(slip.employee_user_id, `Your Paidly payslip for ${periodLabel} has been emailed.`);
  }
  return { sent: 1, id: slip.id };
}

export async function listStatutoryRules(orgId) {
  const { data: platform } = await supabaseAdmin.from("payroll_statutory_rules").select("*").is("org_id", null);
  const { data: orgRules } = await supabaseAdmin.from("payroll_statutory_rules").select("*").eq("org_id", orgId);
  return { platform: platform || [], org: orgRules || [] };
}

export async function getEmployerPayrollSettings(orgId) {
  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .select("name, registration_number, company_email, phone, address, payroll_settings")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  const refs = normalizeEmployerPayrollSettings(org?.payroll_settings);
  return {
    company_name: org?.name || null,
    registration_number: org?.registration_number || null,
    company_email: org?.company_email || null,
    phone: org?.phone || null,
    address: org?.address || null,
    ...refs,
  };
}

export async function updateEmployerPayrollSettings(orgId, actorId, payload = {}) {
  const { data: org, error: loadErr } = await supabaseAdmin
    .from("organizations")
    .select("payroll_settings, registration_number")
    .eq("id", orgId)
    .maybeSingle();
  if (loadErr) throw loadErr;

  const patch = {};
  if (Object.prototype.hasOwnProperty.call(payload, "registration_number")) {
    patch.registration_number = String(payload.registration_number || "").trim() || null;
  }
  const hasRefPatch = [
    "paye_reference",
    "uif_reference",
    "sdl_reference",
    "trading_name",
    "people_reminder_lead_days",
  ].some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  if (hasRefPatch) {
    patch.payroll_settings = mergeEmployerPayrollSettings(org?.payroll_settings, payload);
  }
  if (!Object.keys(patch).length) {
    return getEmployerPayrollSettings(orgId);
  }

  const { error } = await supabaseAdmin.from("organizations").update(patch).eq("id", orgId);
  if (error) throw error;
  await writePayrollAudit({
    orgId,
    actorId,
    action: "EMPLOYER_PAYROLL_SETTINGS_UPDATED",
    recordType: "organizations",
    recordId: orgId,
    metadata: {
      keys: Object.keys(patch),
    },
  });
  return getEmployerPayrollSettings(orgId);
}

const REPORT_RUN_COLUMNS =
  "id, period_label, period_start, period_end, pay_date, status, finalized_at, net_total, gross_total, deductions_total, employee_count, run_type, original_pay_run_id";
const REPORT_ITEM_COLUMNS =
  "id, pay_run_id, membership_id, employee_number, employee_name, status, gross_pay, net_pay, total_deductions, statutory_deductions, other_deductions, calculation, payslip_id";
/** 20 years of monthly runs — the full Paidly payroll history for a company. */
const REPORT_HISTORY_LIMIT = 240;

function monthRange(month) {
  const m = String(month || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const bounds = monthBounds(Number(m[1]), Number(m[2]));
  return bounds?.start && bounds?.end ? { start: bounds.start, end: bounds.end } : null;
}

function labelForMonth(month) {
  const m = String(month || "").match(/^(\d{4})-(\d{2})$/);
  return m ? monthLabel(Number(m[1]), Number(m[2])) : month || null;
}

function isoDateOrNull(value) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

async function listFinalizedRuns(orgId) {
  const { data, error } = await supabaseAdmin
    .from("pay_runs")
    .select(REPORT_RUN_COLUMNS)
    .eq("org_id", orgId)
    .not("finalized_at", "is", null)
    .order("period_start", { ascending: false })
    .limit(REPORT_HISTORY_LIMIT);
  if (error) throw error;
  return data || [];
}

async function loadRunItems(orgId, runIds) {
  if (!runIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("pay_run_items")
    .select(REPORT_ITEM_COLUMNS)
    .in("pay_run_id", runIds)
    .eq("org_id", orgId);
  if (error) throw error;
  return data || [];
}

async function loadPayslipContext(orgId, payslipIds) {
  const byId = new Map();
  const ids = [...new Set(payslipIds.filter(Boolean).map(String))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("payslips")
      .select("id, payslip_number, status, department, position")
      .eq("org_id", orgId)
      .in("id", ids.slice(i, i + 200));
    for (const row of data || []) byId.set(String(row.id), row);
  }
  return byId;
}

/**
 * Select finalized runs for a report query. Historical: never recalculates.
 * @param {Array<Record<string, any>>} periods finalized runs, newest first
 * @param {{ pay_run_id?: string|null, month?: string|null, period_start?: string|null, period_end?: string|null, allHistory?: boolean }} q
 */
function selectReportRuns(periods, q) {
  const runId = parseUuid(q.pay_run_id);
  if (runId) return periods.filter((r) => r.id === runId);
  const month = monthRange(q.month);
  if (month) {
    return periods.filter((r) => {
      const anchor = String(r.pay_date || r.period_end || "").slice(0, 10);
      const start = String(r.period_start || "").slice(0, 10);
      return (start >= month.start && start <= month.end) || (anchor >= month.start && anchor <= month.end);
    });
  }
  const from = isoDateOrNull(q.period_start);
  const to = isoDateOrNull(q.period_end);
  if (from || to) {
    return periods.filter((r) => {
      if (from && String(r.period_end || "") < from) return false;
      if (to && String(r.period_start || "") > to) return false;
      return true;
    });
  }
  if (q.allHistory) return periods;
  return periods.slice(0, 1);
}

function describeReportPeriod(runList, q) {
  if (runList.length === 1) return runList[0].period_label || `${runList[0].period_start} – ${runList[0].period_end}`;
  if (q.month) return labelForMonth(q.month);
  if (!runList.length) return null;
  const oldest = runList[runList.length - 1];
  const newest = runList[0];
  return `${oldest.period_label || oldest.period_start} – ${newest.period_label || newest.period_end}`;
}

function companyForReports(orgRow, ownerProfile) {
  const snap = buildEmployerSnapshot(orgRow || {}, ownerProfile);
  return {
    company_name: snap.company_name,
    trading_name: snap.trading_name,
    registration_number: snap.registration_number,
    paye_reference: snap.paye_reference,
    uif_reference: snap.uif_reference,
    sdl_reference: snap.sdl_reference,
    currency: ownerProfile?.currency || "ZAR",
  };
}

/**
 * Compliance reports over finalized pay runs — aggregates stored item snapshots.
 * Company scope is the caller's membership org (server-resolved, never from the client).
 *
 * @param {string} orgId
 * @param {{ type?: string, pay_run_id?: string, month?: string, period_start?: string, period_end?: string, department?: string, membership_id?: string, format?: string }} query
 * @param {{ actorId?: string|null }} [actor]
 */
export async function getPayrollReports(orgId, query = {}, actor = {}) {
  const type = String(query.type || "summary").toLowerCase();
  if (!PAYROLL_REPORT_TYPES.includes(type)) {
    const err = new Error(`Report type must be one of: ${PAYROLL_REPORT_TYPES.join(", ")}`);
    err.status = 400;
    throw err;
  }
  const membershipId = parseUuid(query.membership_id);
  if (type === "employee_history" && !membershipId) {
    const err = new Error("Select an employee for the payroll history report.");
    err.status = 400;
    throw err;
  }
  const format = String(query.format || "").toLowerCase() === "csv" ? "csv" : "json";
  const department = String(query.department || "").trim().slice(0, 120) || null;
  const month = monthRange(query.month) ? String(query.month) : null;

  const periods = await listFinalizedRuns(orgId);
  const runList = selectReportRuns(periods, {
    pay_run_id: query.pay_run_id,
    month,
    period_start: query.period_start,
    period_end: query.period_end,
    allHistory: type === "employee_history",
  });

  const runsById = new Map(runList.map((r) => [String(r.id), r]));
  const rawItems = await loadRunItems(orgId, runList.map((r) => r.id));
  const payslipsById = await loadPayslipContext(orgId, rawItems.map((i) => i.payslip_id));
  const contextual = attachReportContext(rawItems, { runsById, payslipsById });
  const items = filterReportItems(contextual, { department, membership_id: membershipId });

  const departments = [...new Set(contextual.map((i) => i.department).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: "base" })
  );
  const employeeMap = new Map();
  for (const item of contextual) {
    if (item.membership_id && !employeeMap.has(item.membership_id)) {
      employeeMap.set(item.membership_id, {
        membership_id: item.membership_id,
        employee_name: item.employee_name,
        employee_number: item.employee_number,
      });
    }
  }

  const report = buildPayrollReport(type, items);
  const { orgRow, ownerProfile } = await loadEmployerBranding(orgId);
  const company = companyForReports(orgRow, ownerProfile);
  const periodLabel = describeReportPeriod(runList, { month });
  const generatedAt = new Date().toISOString();
  const primary = runList.length === 1 ? runList[0] : null;

  const response = {
    type,
    generated_at: generatedAt,
    company,
    filters: {
      pay_run_id: primary?.id || null,
      month,
      period_start: isoDateOrNull(query.period_start),
      period_end: isoDateOrNull(query.period_end),
      department,
      membership_id: membershipId,
    },
    period: primary
      ? {
          pay_run_id: primary.id,
          label: primary.period_label,
          period_start: primary.period_start,
          period_end: primary.period_end,
          pay_date: primary.pay_date,
          status: primary.status,
          net_total: primary.net_total,
          gross_total: primary.gross_total,
          run_type: primary.run_type,
        }
      : {
          pay_run_id: null,
          label: periodLabel,
          period_start: runList[runList.length - 1]?.period_start || null,
          period_end: runList[0]?.period_end || null,
          pay_date: null,
          status: null,
          net_total: null,
          gross_total: null,
          run_type: null,
        },
    pay_runs: runList.map((r) => ({
      id: r.id,
      period_label: r.period_label,
      period_start: r.period_start,
      period_end: r.period_end,
      pay_date: r.pay_date,
      status: r.status,
      net_total: r.net_total,
      run_type: r.run_type,
    })),
    periods: periods.map((r) => ({
      id: r.id,
      period_label: r.period_label,
      period_start: r.period_start,
      period_end: r.period_end,
      pay_date: r.pay_date,
      status: r.status,
      finalized_at: r.finalized_at,
      net_total: r.net_total,
      run_type: r.run_type,
    })),
    departments,
    employees: [...employeeMap.values()].sort((a, b) =>
      String(a.employee_name).localeCompare(String(b.employee_name), undefined, { sensitivity: "base" })
    ),
    report,
  };

  // Net Pay Register: the collective total must match the locked run header.
  if (type === "net_pay" && primary && !department && !membershipId) {
    response.integrity = {
      run_net_total: money(primary.net_total),
      register_net_total: report.totals.net_pay,
      matches: Math.abs(money(primary.net_total) - report.totals.net_pay) < 0.005,
    };
    response.reconciliation = await getPayRunReconciliation(orgId, primary.id);
  }

  if (format === "csv") {
    response.export = {
      filename: payrollReportFilename(type, periodLabel),
      content_type: "text/csv;charset=utf-8",
      csv: payrollReportToCsv(report, {
        companyName: company.trading_name ? `${company.company_name} t/a ${company.trading_name}` : company.company_name,
        registrationNumber: company.registration_number,
        payeReference: company.paye_reference,
        uifReference: company.uif_reference,
        periodLabel,
        generatedAt,
        currency: company.currency,
        filters: {
          Department: department,
          Employee: membershipId ? employeeMap.get(membershipId)?.employee_name || null : null,
        },
      }),
    };
  }

  await writePayrollAudit({
    orgId,
    actorId: actor.actorId || null,
    action: format === "csv" ? "PAYROLL_REPORT_EXPORTED" : "PAYROLL_REPORT_GENERATED",
    recordType: "pay_runs",
    recordId: primary?.id || null,
    // Report parameters only — no salaries or personal data in the audit trail.
    metadata: {
      type,
      format,
      pay_run_count: runList.length,
      month,
      department: department ? true : false,
      employee_scoped: Boolean(membershipId),
    },
  });

  return response;
}

// ── Payroll → bank reconciliation ───────────────────────────────────────────

async function linkedExpenseIdsForOrg(orgId, exceptRunId = null) {
  const { data } = await supabaseAdmin
    .from("pay_runs")
    .select("id, bank_payment_expense_ids")
    .eq("org_id", orgId)
    .not("finalized_at", "is", null)
    .limit(REPORT_HISTORY_LIMIT);
  const ids = new Set();
  for (const row of data || []) {
    if (exceptRunId && row.id === exceptRunId) continue;
    for (const id of row.bank_payment_expense_ids || []) ids.add(String(id));
  }
  return ids;
}

/**
 * Expected (locked net_total) vs actual bank salary payment for one run.
 * @param {string} orgId
 * @param {string} runId
 */
export async function getPayRunReconciliation(orgId, runId) {
  const id = parseUuid(runId);
  if (!id) {
    const err = new Error("Pay run id is required.");
    err.status = 400;
    throw err;
  }
  const { data: run, error } = await supabaseAdmin
    .from("pay_runs")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throwIfMissingWorkforceColumn(error, ["bank_payment_amount", "bank_payment_expense_ids"]);
    throw error;
  }
  if (!run) {
    const err = new Error("Pay run not found.");
    err.status = 404;
    throw err;
  }

  const { data: items } = await supabaseAdmin
    .from("pay_run_items")
    .select("net_pay")
    .eq("pay_run_id", run.id)
    .eq("org_id", orgId);
  const itemsNet = sumAmounts((items || []).map((i) => ({ amount: i.net_pay })));

  const linkedIds = (run.bank_payment_expense_ids || []).map(String);
  let linked = [];
  if (linkedIds.length) {
    const { data } = await supabaseAdmin
      .from("expenses")
      .select("id, date, amount, description, vendor, category")
      .eq("org_id", orgId)
      .in("id", linkedIds);
    linked = (data || []).map((row) => ({
      id: row.id,
      date: String(row.date || "").slice(0, 10),
      amount: money(row.amount),
      description: row.description || row.vendor || null,
      vendor: row.vendor || null,
    }));
  }

  let candidates = [];
  if (run.finalized_at) {
    const windowStart = String(run.period_start || "").slice(0, 10);
    const { data: expenseRows } = await supabaseAdmin
      .from("expenses")
      .select("id, date, amount, description, vendor, category")
      .eq("org_id", orgId)
      .gte("date", windowStart)
      .order("date", { ascending: true })
      .limit(200);
    const taken = await linkedExpenseIdsForOrg(orgId, run.id);
    for (const idLinked of linkedIds) taken.add(idLinked);
    candidates = salaryExpenseCandidates(expenseRows || [], run, { excludeIds: taken });
  }

  const recon = reconcilePayrollPayment({
    expected: run.net_total,
    actual: run.bank_payment_amount,
    finalised: Boolean(run.finalized_at),
  });

  return {
    pay_run_id: run.id,
    period_label: run.period_label,
    period_start: run.period_start,
    period_end: run.period_end,
    pay_date: run.pay_date,
    run_status: run.status,
    finalized_at: run.finalized_at,
    employee_count: run.employee_count,
    ...recon,
    items_net_total: itemsNet,
    totals_match: Math.abs(itemsNet - money(run.net_total)) < 0.005,
    bank_payment_date: run.bank_payment_date || null,
    bank_payment_reference: run.bank_payment_reference || null,
    reconciled_at: run.bank_reconciled_at || null,
    linked_expenses: linked,
    candidate_expenses: candidates,
  };
}

/**
 * Record the actual salary payment for a finalized run (amount and/or matched
 * Cash Flow expenses). Does not touch locked payroll amounts.
 * @param {string} orgId
 * @param {string} actorId
 * @param {string} runId
 * @param {{ amount?: number|string|null, payment_date?: string|null, reference?: string|null, expense_ids?: string[], clear?: boolean, mark_paid?: boolean }} body
 */
export async function recordPayRunBankPayment(orgId, actorId, runId, body = {}) {
  const current = await getPayRunReconciliation(orgId, runId);
  if (!current.finalized_at) {
    const err = new Error("Finalize payroll before recording the bank salary payment.");
    err.status = 409;
    throw err;
  }

  let patch;
  if (body.clear === true) {
    patch = {
      bank_payment_amount: null,
      bank_payment_date: null,
      bank_payment_reference: null,
      bank_payment_expense_ids: [],
      bank_reconciled_at: null,
      bank_reconciled_by: null,
    };
  } else {
    const requestedIds = Array.isArray(body.expense_ids) ? body.expense_ids.map(parseUuid).filter(Boolean) : [];
    const expenseIds = [...new Set(requestedIds)].slice(0, 200);
    let expenseTotal = null;
    if (expenseIds.length) {
      const { data: owned, error } = await supabaseAdmin
        .from("expenses")
        .select("id, amount")
        .eq("org_id", orgId)
        .in("id", expenseIds);
      if (error) throw error;
      if ((owned || []).length !== expenseIds.length) {
        const err = new Error("One or more bank transactions are not in your company.");
        err.status = 403;
        throw err;
      }
      const taken = await linkedExpenseIdsForOrg(orgId, current.pay_run_id);
      if (expenseIds.some((eid) => taken.has(eid))) {
        const err = new Error("A selected bank transaction is already matched to another pay run.");
        err.status = 409;
        throw err;
      }
      expenseTotal = sumAmounts(owned);
    }

    const hasAmount = body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== "";
    const amount = hasAmount ? Number(body.amount) : expenseTotal;
    if (amount == null || !Number.isFinite(amount) || amount < 0) {
      const err = new Error("Enter the actual bank payment amount or select the matching bank transactions.");
      err.status = 400;
      throw err;
    }
    const paymentDate = isoDateOrNull(body.payment_date) || isoDateOrNull(current.bank_payment_date) || null;
    const reference = String(body.reference ?? current.bank_payment_reference ?? "").trim().slice(0, 120) || null;
    const recon = reconcilePayrollPayment({ expected: current.expected, actual: amount, finalised: true });
    patch = {
      bank_payment_amount: money(amount),
      bank_payment_date: paymentDate,
      bank_payment_reference: reference,
      bank_payment_expense_ids: expenseIds,
      bank_reconciled_at: recon.status === RECONCILIATION_STATUS.RECONCILED ? new Date().toISOString() : null,
      bank_reconciled_by: recon.status === RECONCILIATION_STATUS.RECONCILED ? actorId || null : null,
    };
  }

  const { error: upErr } = await supabaseAdmin
    .from("pay_runs")
    .update(patch)
    .eq("id", current.pay_run_id)
    .eq("org_id", orgId);
  if (upErr) {
    throwIfMissingWorkforceColumn(upErr, ["bank_payment_amount", "bank_payment_expense_ids"]);
    throw upErr;
  }

  const next = await getPayRunReconciliation(orgId, current.pay_run_id);
  await writePayrollAudit({
    orgId,
    actorId,
    action: body.clear === true ? "PAY_RUN_BANK_PAYMENT_CLEARED" : "PAY_RUN_BANK_PAYMENT_RECORDED",
    recordType: "pay_runs",
    recordId: current.pay_run_id,
    metadata: {
      status: next.status,
      difference: next.difference,
      matched_transactions: (patch.bank_payment_expense_ids || []).length,
    },
  });

  if (body.mark_paid === true && next.run_status !== "paid") {
    await markPayRunPaid(orgId, actorId, current.pay_run_id);
    return getPayRunReconciliation(orgId, current.pay_run_id);
  }
  return next;
}

// ── Dashboard: payroll's share of the company financial picture ─────────────

/**
 * Payroll metrics for the current Johannesburg calendar month, from finalized
 * runs only. Expenses already matched to a pay run are reported separately so
 * the dashboard never counts salaries twice.
 * @param {string} orgId
 */
export async function getPayrollDashboard(orgId) {
  const today = johannesburgYmd();
  const bounds = monthBounds(today.year, today.month);
  const month = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const periods = await listFinalizedRuns(orgId);
  const monthRuns = selectReportRuns(periods, { month });
  const items = await loadRunItems(orgId, monthRuns.map((r) => r.id));
  const summary = buildPayrollSummary(items);

  const { data: openRuns } = await supabaseAdmin
    .from("pay_runs")
    .select("id, period_label, period_start, period_end, status, employee_count, net_total")
    .eq("org_id", orgId)
    .is("finalized_at", null)
    .neq("status", "cancelled")
    .order("period_start", { ascending: false })
    .limit(5);

  let openRunWarnings = 0;
  const openRun = (openRuns || [])[0] || null;
  if (openRun) {
    const { data: openItems } = await supabaseAdmin
      .from("pay_run_items")
      .select("warnings")
      .eq("pay_run_id", openRun.id)
      .eq("org_id", orgId);
    openRunWarnings = (openItems || []).filter((i) => Array.isArray(i.warnings) && i.warnings.length).length;
  }

  const linkedIds = await linkedExpenseIdsForOrg(orgId);
  const { data: expenseRows } = await supabaseAdmin
    .from("expenses")
    .select("id, amount, category")
    .eq("org_id", orgId)
    .gte("date", bounds.start)
    .lte("date", bounds.end)
    .limit(2000);
  let operatingExpenses = 0;
  let payrollMatchedExpenses = 0;
  let unmatchedSalaryExpenses = 0;
  for (const row of expenseRows || []) {
    const amt = money(row.amount);
    if (linkedIds.has(String(row.id))) {
      payrollMatchedExpenses += amt;
      continue;
    }
    if (String(row.category || "").toLowerCase() === "salary") unmatchedSalaryExpenses += amt;
    operatingExpenses += amt;
  }

  const reconciliations = monthRuns.map((run) =>
    reconcilePayrollPayment({ expected: run.net_total, actual: run.bank_payment_amount, finalised: true })
  );

  return {
    month,
    month_label: labelForMonth(month),
    period: { start: bounds.start, end: bounds.end },
    finalized_runs: monthRuns.map((r) => ({
      id: r.id,
      period_label: r.period_label,
      status: r.status,
      net_total: money(r.net_total),
      run_type: r.run_type,
    })),
    gross_payroll: summary.gross_payroll,
    net_payroll: summary.net_payroll,
    paye: summary.paye,
    uif_employee: summary.uif_employee,
    uif_employer: summary.uif_employer,
    uif_total: summary.uif_total,
    sdl_employer: summary.sdl_employer,
    employer_statutory: summary.employer_statutory,
    total_employer_cost: summary.total_employer_cost,
    employee_count: summary.employee_count,
    open_run: openRun
      ? {
          id: openRun.id,
          period_label: openRun.period_label,
          status: openRun.status,
          employee_count: openRun.employee_count,
          warnings: openRunWarnings,
        }
      : null,
    exceptions: openRunWarnings + reconciliations.filter((r) => r.status === RECONCILIATION_STATUS.VARIANCE).length,
    reconciliation: {
      expected: sumAmounts(reconciliations.map((r) => ({ amount: r.expected }))),
      actual: reconciliations.every((r) => r.actual != null)
        ? sumAmounts(reconciliations.map((r) => ({ amount: r.actual })))
        : null,
      reconciled: reconciliations.filter((r) => r.status === RECONCILIATION_STATUS.RECONCILED).length,
      variance: reconciliations.filter((r) => r.status === RECONCILIATION_STATUS.VARIANCE).length,
      awaiting: reconciliations.filter((r) => r.status === RECONCILIATION_STATUS.AWAITING_PAYMENT).length,
    },
    expenses: {
      operating: money(operatingExpenses),
      payroll_matched: money(payrollMatchedExpenses),
      unmatched_salary: money(unmatchedSalaryExpenses),
    },
  };
}

export async function upsertStatutoryRule(orgId, actorId, payload) {
  assertAppendOnlyStatutoryPayload(payload);
  const row = statutoryVersionRow(orgId, payload);
  if (!row.code || !row.effective_from || !row.calculation_type) {
    const err = new Error("code, effective_from, and calculation_type are required.");
    err.status = 400;
    throw err;
  }

  const { data: previous } = await supabaseAdmin
    .from("payroll_statutory_rules")
    .select("id, effective_from, effective_to")
    .eq("org_id", orgId)
    .eq("code", row.code)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const closeTo = supersedeEffectiveTo(previous, row.effective_from);
  if (previous?.id && closeTo) {
    const { error: closeErr } = await supabaseAdmin
      .from("payroll_statutory_rules")
      .update({ effective_to: closeTo })
      .eq("id", previous.id)
      .eq("org_id", orgId);
    if (closeErr) throw closeErr;
    await writePayrollAudit({
      orgId,
      actorId,
      action: "STATUTORY_RULE_SUPERSEDED",
      recordType: "payroll_statutory_rules",
      recordId: previous.id,
      metadata: { effective_to: closeTo, next_from: row.effective_from },
    });
  }

  const { data, error } = await supabaseAdmin.from("payroll_statutory_rules").insert(row).select("*").maybeSingle();
  if (error) {
    if (error.code === "23505") {
      const err = new Error("A statutory version already exists for this code and effective_from.");
      err.status = 409;
      throw err;
    }
    throw error;
  }
  await writePayrollAudit({
    orgId,
    actorId,
    action: "STATUTORY_RULE_VERSION_CREATED",
    recordType: "payroll_statutory_rules",
    recordId: data?.id,
  });
  return data;
}

export async function ensureDraftAdjustmentRun(orgId, originalPayRunId, actorId = null) {
  const originalId = parseUuid(originalPayRunId);
  if (!orgId || !originalId) return { created: false, runId: null };
  const { data: existing } = await supabaseAdmin
    .from("pay_runs")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("run_type", "adjustment")
    .eq("original_pay_run_id", originalId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return { created: false, runId: existing.id };
  const run = await createPayRun(orgId, actorId, {
    run_type: "adjustment",
    original_pay_run_id: originalId,
  });
  return { created: true, runId: run.id };
}

export { PAY_RUN_STATUSES };
