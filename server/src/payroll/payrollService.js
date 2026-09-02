import crypto from "node:crypto";
import { supabaseAdmin, writePayrollAudit, notifyUser } from "./payrollGate.js";
import { calculatePayroll, selectStatutoryRules } from "../../../shared/payroll/calculatePayroll.js";
import { buildPayslipNumber, buildEmployeeNumber, nextEmployeeSequence } from "../../../shared/payroll/payslipNumber.js";
import { johannesburgYmd, monthBounds, monthLabel } from "../../../shared/payroll/dates.js";
import { PAY_RUN_STATUSES } from "../../../shared/payroll/constants.js";
import { sendHtmlEmail } from "../sendInvoice.js";

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

async function profileMapForUsers(userIds) {
  if (!userIds.length) return new Map();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, first_name, last_name, email, job_title, department, phone")
    .in("id", userIds);
  return new Map((data || []).map((p) => [p.id, p]));
}

function displayName(profile, fallbackEmail) {
  const joined = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return String(profile?.full_name || joined || fallbackEmail || "Employee").trim();
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
  const byUser = new Map((existing || []).map((p) => [p.user_id, p]));
  const people = await profileMapForUsers(members.map((m) => m.user_id).filter(Boolean));
  const usedNumbers = (existing || []).map((p) => p.employee_number).filter(Boolean);
  let seq = nextEmployeeSequence(usedNumbers);

  for (const member of members) {
    if (byMembership.has(member.id) || byUser.has(member.user_id)) continue;
    const person = people.get(member.user_id);
    const number = buildEmployeeNumber(seq);
    seq += 1;
    await insertPayrollProfileRow({
      org_id: orgId,
      membership_id: member.id,
      user_id: member.user_id || null,
      employee_number: number,
      full_name: displayName(person, person?.email),
      email: person?.email || null,
      job_title: person?.job_title || null,
      department: person?.department || null,
      employment_status: "active",
      payroll_status: "active",
      pay_frequency: "monthly",
      pay_type: "monthly_salary",
    });
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

export async function previewCalculation(orgId, payload) {
  const rules = await loadStatutoryRules(orgId, payload.period_end || johannesburgYmd().iso);
  return calculatePayroll({
    profile: payload.profile || {},
    earnings: payload.earnings || [],
    deductions: payload.deductions || [],
    statutoryRules: rules,
    overtimeHours: payload.overtime_hours,
    overtimeRate: payload.overtime_rate,
    extras: payload.extras || {},
  });
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
    const items = profiles.map((p) => ({
      org_id: orgId,
      pay_run_id: data.id,
      payroll_profile_id: p.id,
      membership_id: p.membership_id,
      user_id: p.user_id,
      employee_number: p.employee_number,
      employee_name: p.full_name,
      status: "pending",
    }));
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
  const run = await getPayRun(orgId, runId);
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
    });
    grossTotal += result.gross_pay;
    dedTotal += result.total_deductions;
    netTotal += result.net_pay;
    const { error } = await supabaseAdmin
      .from("pay_run_items")
      .update({
        employee_number: profile.employee_number || item.employee_number,
        employee_name: profile.full_name || item.employee_name,
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
        calculation: result.breakdown,
        warnings: result.warnings,
      })
      .eq("id", item.id);
    if (error) throw error;
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
    const { data: payslip, error } = await supabaseAdmin.from("payslips").insert(payslipRow).select("id").maybeSingle();
    if (error) throw error;
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

export async function sendPayRunPayslips(orgId, actorId, runId, origin) {
  const run = await getPayRun(orgId, runId);
  if (!run.finalized_at) {
    const err = new Error("Finalize payroll before sending payslips.");
    err.status = 409;
    throw err;
  }
  const { data: payslips } = await supabaseAdmin
    .from("payslips")
    .select("id, employee_name, employee_email, employee_user_id, public_share_token, payslip_number")
    .eq("org_id", orgId)
    .eq("pay_run_id", runId);

  const base = String(origin || "").replace(/\/$/, "") || "https://www.paidly.co.za";
  let sent = 0;
  for (const slip of payslips || []) {
    const to = slip.employee_email;
    if (!to) continue;
    const token = slip.public_share_token || crypto.randomUUID();
    if (!slip.public_share_token) {
      await supabaseAdmin.from("payslips").update({ public_share_token: token }).eq("id", slip.id);
    }
    await supabaseAdmin.from("payslips").update({ sent_to_email: to, status: "sent" }).eq("id", slip.id);
    const url = `${base}/PublicPayslip?token=${encodeURIComponent(token)}`;
    const html = `
      <p>Hi ${escapeHtml(slip.employee_name || "there")},</p>
      <p>Your Paidly payslip for <strong>${escapeHtml(run.period_label)}</strong> is ready.</p>
      <p>Payslip number: <strong>${escapeHtml(slip.payslip_number || "")}</strong></p>
      <p><a href="${escapeHtml(url)}">View your payslip</a> (sign-in or email verification may be required).</p>
      <p>This link is for you only. Do not forward it.</p>
    `;
    await sendHtmlEmail(to, `Your Paidly payslip for ${run.period_label}`, html, "Paidly");
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
  return { sent, total: (payslips || []).length };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
