import { buildPayrollReport, PAYROLL_REPORT_TYPES, payrollReportToCsv } from "@shared/payroll/payrollReports.js";
import { reconcilePayrollPayment } from "@shared/payroll/payrollReconciliation.js";
import {
  directoryFacets,
  filterWorkforceDirectory,
  paginateRows,
  sortWorkforceDirectory,
} from "@shared/workforce/directory.js";
import {
  eligibleManagersFromRoster,
  employeeAttentionReasons,
  managerAssignmentState,
  workforceLifecycleStatus,
} from "@shared/workforce/employeeLifecycle.js";
import { buildOrganogramTree } from "@shared/workforce/organogram.js";
import { buildPeopleCalendarEvents } from "@shared/workforce/peopleCalendar.js";
import { DEMO_MEMBERSHIP_ID } from "./demoSandboxSeed.js";
import { demoTable, touchDemoDataset } from "./demoSandboxStore.js";

const RUN_ID = "23000001-0000-4000-8000-000000000001";
const ANNUAL_LEAVE_ID = "24000001-0000-4000-8000-000000000001";
const SICK_LEAVE_ID = "24000001-0000-4000-8000-000000000002";
const FAMILY_LEAVE_ID = "24000001-0000-4000-8000-000000000003";

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isoShift(daysAhead, yearsBack) {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() + daysAhead);
  dt.setUTCFullYear(dt.getUTCFullYear() - yearsBack);
  return dt.toISOString().slice(0, 10);
}

function johannesburgToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function lastDay(yyyyMm) {
  const [y, m] = String(yyyyMm).split("-").map(Number);
  if (!y || !m) return null;
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function periodLabel(yyyyMm) {
  if (!/^\d{4}-\d{2}$/.test(String(yyyyMm || ""))) return "Current period";
  const [y, m] = String(yyyyMm).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-ZA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function roster() {
  const staff = demoTable("employees") || [];
  const slips = demoTable("payslips") || [];
  const manager = staff.find((row) => /manager/i.test(String(row.job_title || ""))) || staff[staff.length - 1] || null;
  return staff.map((person, i) => {
    const slip = slips[i] || {};
    const isManager = Boolean(manager && person.id === manager.id);
    const birthdayIn = [12, 20, 8, 40][i] ?? 15 + i;
    const anniversaryIn = [12, 20, 8, 18][i] ?? 14 + i;
    const years = [2, 3, 1, 5][i] ?? 2;
    const start = isoShift(anniversaryIn, years);
    const born = isoShift(birthdayIn, 28 + i);
    const row = {
      id: person.id,
      employee_id: person.id,
      membership_id: person.id,
      payroll_profile_id: `81000002-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
      user_id: null,
      role: isManager ? "manager" : "employee",
      job_function: isManager ? "hr" : "general",
      employee_number: `EMP-${String(i + 1).padStart(3, "0")}`,
      department: person.job_title || null,
      job_title: person.job_title || null,
      employment_status: "active",
      employment_start_date: start,
      date_of_birth: born,
      attendance_status: "active",
      manager_membership_id: isManager ? DEMO_MEMBERSHIP_ID : manager?.id || null,
      manager_name: isManager ? "Demo Host" : manager?.name || null,
      manager_active: true,
      email: person.email || null,
      full_name: person.name || slip.employee_name || "Employee",
      label: person.name || slip.employee_name || "Employee",
      base_salary: money(slip.gross_pay),
      pay_type: "monthly_salary",
      pay_frequency: "monthly",
      payroll_status: "active",
      leave_status: "none",
      payslip_count: slip.id ? 1 : 0,
      disabled_at: null,
      gross_pay: money(slip.gross_pay),
      net_pay: money(slip.net_pay),
      payslip_id: slip.id || null,
      payslip_status: slip.status || "paid",
      pay_period: slip.pay_period || null,
    };
    row.lifecycle_status = workforceLifecycleStatus(row);
    row.manager_assignment = managerAssignmentState(row);
    row.attention_reasons = employeeAttentionReasons(row);
    row.needs_attention = row.attention_reasons.length > 0;
    return row;
  });
}

function itemsFromSeed() {
  return roster().map((person) => {
    const gross = money(person.gross_pay);
    const net = money(person.net_pay);
    const uif = Math.min(money(gross * 0.01), 177.12);
    const paye = money(Math.max(0, gross - net - uif));
    const period = String(person.pay_period || "").slice(0, 7);
    const start = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : null;
    const end = lastDay(period);
    return {
      pay_run_id: RUN_ID,
      membership_id: person.id,
      employee_number: person.employee_number,
      employee_name: person.full_name,
      department: person.department,
      job_title: person.job_title,
      period_label: periodLabel(period),
      period_start: start,
      period_end: end,
      pay_date: end,
      run_status: "finalized",
      run_type: "regular",
      payslip_number: `PS-${period.replace("-", "") || "000000"}-${person.employee_number.slice(-3)}`,
      payslip_status: person.payslip_status || "paid",
      status: "paid",
      gross_pay: gross,
      net_pay: net,
      total_deductions: money(gross - net),
      other_deductions: [],
      statutory_deductions: [
        { code: "PAYE", amount: paye },
        { code: "UIF", amount: uif, employer_amount: uif, base_amount: gross },
        { code: "SDL", amount: 0, employer_amount: money(gross * 0.01), employee_portion: false },
      ],
    };
  });
}

function parseQuery(path) {
  const q = String(path || "").includes("?") ? String(path).slice(String(path).indexOf("?") + 1) : "";
  return Object.fromEntries(new URLSearchParams(q));
}

function workforceSummary() {
  const staff = demoTable("employees") || [];
  const slips = demoTable("payslips") || [];
  const period = String(slips[0]?.pay_period || "").slice(0, 7);
  return {
    workforce: {
      total: staff.length,
      active: staff.length,
      inactive: 0,
      needs_attention: 0,
      incomplete_profiles: 0,
    },
    leave: leaveCounts(),
    payroll: {
      payslips_generated: slips.length,
      draft: 0,
      awaiting_review: 0,
      last_run_status: "finalized",
      current_period: /^\d{4}-\d{2}$/.test(period)
        ? { label: periodLabel(period), start: `${period}-01`, end: lastDay(period), status: "finalized" }
        : null,
    },
  };
}

function payrollReport(query) {
  const type = String(query.type || "summary").toLowerCase();
  if (!PAYROLL_REPORT_TYPES.includes(type)) {
    const err = new Error(`Report type must be one of: ${PAYROLL_REPORT_TYPES.join(", ")}`);
    err.status = 400;
    throw err;
  }
  const all = itemsFromSeed();
  const membershipId = query.membership_id || null;
  if (type === "employee_history" && !membershipId) {
    const err = new Error("Select an employee for the payroll history report.");
    err.status = 400;
    throw err;
  }

  let items = all;
  const month = /^\d{4}-\d{2}$/.test(String(query.month || "")) ? String(query.month) : null;
  if (month) items = items.filter((row) => String(row.period_start || "").startsWith(month));
  if (query.period_start) {
    const from = String(query.period_start).slice(0, 10);
    items = items.filter((row) => !row.period_end || row.period_end >= from);
  }
  if (query.period_end) {
    const to = String(query.period_end).slice(0, 10);
    items = items.filter((row) => !row.period_start || row.period_start <= to);
  }
  if (query.department) {
    const dept = String(query.department).trim().toLowerCase();
    items = items.filter((row) => String(row.department || "").trim().toLowerCase() === dept);
  }
  if (membershipId) items = items.filter((row) => row.membership_id === membershipId);
  if (query.pay_run_id && query.pay_run_id !== RUN_ID && !month && !query.period_start && !query.period_end) {
    items = [];
  }

  const report = buildPayrollReport(type, items);
  const departments = [...new Set(all.map((row) => row.department).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b))
  );
  const employees = all
    .map((row) => ({
      membership_id: row.membership_id,
      employee_name: row.employee_name,
      employee_number: row.employee_number,
    }))
    .sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)));
  const sample = all[0] || null;
  const netTotal = money(all.reduce((sum, row) => sum + row.net_pay, 0));
  const grossTotal = money(all.reduce((sum, row) => sum + row.gross_pay, 0));
  const label = sample?.period_label || "Current period";
  const response = {
    type,
    generated_at: new Date().toISOString(),
    company: { company_name: "Mavela Café", trading_name: "Mavela Café", currency: "ZAR" },
    filters: {
      pay_run_id: query.pay_run_id || RUN_ID,
      month,
      period_start: query.period_start || null,
      period_end: query.period_end || null,
      department: query.department || null,
      membership_id: membershipId,
    },
    period: {
      pay_run_id: RUN_ID,
      label,
      period_start: sample?.period_start || null,
      period_end: sample?.period_end || null,
      pay_date: sample?.pay_date || null,
      status: "finalized",
      net_total: netTotal,
      gross_total: grossTotal,
      run_type: "regular",
    },
    pay_runs: [
      {
        id: RUN_ID,
        period_label: label,
        period_start: sample?.period_start || null,
        period_end: sample?.period_end || null,
        pay_date: sample?.pay_date || null,
        status: "finalized",
        net_total: netTotal,
        run_type: "regular",
      },
    ],
    periods: [
      {
        id: RUN_ID,
        period_label: label,
        period_start: sample?.period_start || null,
        period_end: sample?.period_end || null,
        pay_date: sample?.pay_date || null,
        status: "finalized",
        finalized_at: new Date().toISOString(),
        net_total: netTotal,
        run_type: "regular",
      },
    ],
    departments,
    employees,
    report,
  };

  if (type === "net_pay" && !query.department && !membershipId) {
    response.integrity = {
      run_net_total: netTotal,
      register_net_total: report.totals?.net_pay,
      matches: Math.abs(netTotal - Number(report.totals?.net_pay || 0)) < 0.005,
    };
  }

  if (String(query.format || "").toLowerCase() === "csv") {
    response.export = {
      filename: `mavela-${type}.csv`,
      content_type: "text/csv;charset=utf-8",
      csv: payrollReportToCsv(report, {
        companyName: "Mavela Café",
        periodLabel: label,
        currency: "ZAR",
      }),
    };
  }

  return response;
}

/**
 * Local answer for payroll and workforce HTTP calls while the demo sandbox is on.
 * Returns null when this path is not part of the demo dataset.
 * @param {string} path
 */
function employeeBundle(query) {
  const row = roster().find((item) => item.id === query.id);
  if (!row) {
    const err = new Error("Employee not found");
    err.status = 404;
    throw err;
  }
  const sections = String(query.sections || "").toLowerCase();
  const include = String(query.include || "").toLowerCase();
  if (!sections && include !== "profile") return row;
  const period = String(row.pay_period || "").slice(0, 7);
  const bundle = { employee: row };
  if (include === "profile" || sections.includes("payslips")) {
    const start = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : null;
    bundle.payslips = row.payslip_id
      ? [
          {
            id: row.payslip_id,
            payslip_number: `PS-${(period || "000000").replace("-", "")}-${row.employee_number.slice(-3)}`,
            pay_period_start: start,
            pay_period_end: lastDay(period),
            pay_date: lastDay(period),
            net_pay: row.net_pay,
            gross_pay: row.gross_pay,
            status: row.payslip_status || "paid",
            locked: true,
            membership_id: row.id,
          },
        ]
      : [];
  }
  if (sections.includes("leave")) {
    bundle.leave_requests = [];
    bundle.leave_balances = [];
  }
  if (sections.includes("documents")) bundle.documents = [];
  if (sections.includes("attendance")) bundle.attendance = [];
  if (sections.includes("activity") || sections.includes("audit")) bundle.audit = [];
  return bundle;
}

function employeeList(query) {
  const rows = roster();
  if (query.eligible_managers === "1") {
    return eligibleManagersFromRoster(rows, { excludeId: query.exclude_id || null }).map((row) => ({
      id: row.id,
      employee_id: row.id,
      membership_id: row.id,
      full_name: row.full_name,
      label: row.full_name,
      employee_number: row.employee_number,
      role: row.role,
      job_function: row.job_function,
      employment_status: row.employment_status,
      department: row.department,
    }));
  }
  if (query.id) return employeeBundle(query);
  const filtered = sortWorkforceDirectory(
    filterWorkforceDirectory(rows, {
      q: query.q,
      department: query.department,
      status: query.status,
      managerId: query.manager_id,
      jobTitle: query.job_title,
      leaveStatus: query.leave_status,
      attention: query.attention,
    }),
    query.sort || "name"
  );
  const facets = directoryFacets(rows);
  const managers = eligibleManagersFromRoster(rows);
  if (query.page_all === "1") {
    return {
      items: filtered,
      total: filtered.length,
      limit: filtered.length,
      offset: 0,
      facets,
      eligible_managers: managers,
    };
  }
  return {
    ...paginateRows(filtered, { limit: query.limit, offset: query.offset }),
    facets,
    eligible_managers: managers,
  };
}

function demoPayRun() {
  const people = roster();
  const sample = people[0] || null;
  const period = String(sample?.pay_period || "").slice(0, 7);
  const start = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : null;
  const end = lastDay(period);
  const gross = money(people.reduce((sum, person) => sum + person.gross_pay, 0));
  const net = money(people.reduce((sum, person) => sum + person.net_pay, 0));
  const items = people.map((person) => ({
    id: person.payslip_id || person.id,
    employee_name: person.full_name,
    employee_number: person.employee_number,
    membership_id: person.id,
    base_pay: person.gross_pay,
    overtime_amount: 0,
    earnings: [],
    gross_pay: person.gross_pay,
    total_deductions: money(person.gross_pay - person.net_pay),
    net_pay: person.net_pay,
    payslip_id: person.payslip_id,
    status: "paid",
  }));
  return {
    id: RUN_ID,
    period_label: periodLabel(period),
    period_start: start,
    period_end: end,
    pay_date: end,
    status: "paid",
    run_type: "regular",
    frequency: "monthly",
    employee_count: people.length,
    gross_total: gross,
    deductions_total: money(gross - net),
    net_total: net,
    finalized_at: end ? `${end}T08:00:00.000Z` : new Date().toISOString(),
    bank_payment_amount: net,
    bank_payment_date: end,
    bank_payment_reference: "DEMO-PAYROLL",
    needs_adjustment_run: false,
    items,
  };
}

function payrollOverview() {
  const run = demoPayRun();
  const { items: _items, ...header } = run;
  return {
    payslip_capacity: {
      limit: null,
      used: run.employee_count,
      ok: true,
      upgrade_to: null,
      blocked_employees: [],
    },
    employees: run.employee_count,
    current_period: { label: run.period_label, start: run.period_start, end: run.period_end },
    current_run: header,
    current_period_covered: true,
    runs: [header],
    pending_payroll: 0,
    completed_payroll: 1,
    gross_payroll: run.gross_total,
    total_deductions: run.deductions_total,
    total_net: run.net_total,
    needs_adjustment_run: false,
    adjustment_signals: [],
  };
}

function payRunById(runId) {
  const run = demoPayRun();
  if (runId !== run.id) {
    const err = new Error("Pay run not found");
    err.status = 404;
    throw err;
  }
  return run;
}

function payrollReconciliation(runId) {
  const run = payRunById(runId);
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
    items_net_total: run.net_total,
    totals_match: true,
    bank_payment_date: run.bank_payment_date,
    bank_payment_reference: run.bank_payment_reference,
    reconciled_at: run.finalized_at,
    linked_expenses: [],
    candidate_expenses: [],
  };
}

function organogram() {
  return { ...buildOrganogramTree(roster()), company: { name: "Mavela Café" }, scoped: false };
}

function peopleCalendar(query) {
  const daysAhead = Math.min(366, Math.max(1, Number(query.days_ahead) || 30));
  const todayIso = johannesburgToday();
  const people = roster();
  return {
    ...buildPeopleCalendarEvents(people, { todayIso, daysAhead, includeAge: true }),
    reminder_lead_days: 7,
    coverage: {
      employees: people.length,
      with_date_of_birth: people.filter((row) => row.date_of_birth).length,
      with_start_date: people.filter((row) => row.employment_start_date).length,
    },
  };
}

function leaveTypeCatalog() {
  return [
    {
      id: ANNUAL_LEAVE_ID,
      name: "Annual leave",
      code: "ANNUAL",
      days_per_year: 21,
      accrual_method: "monthly",
      paid: true,
      requires_approval: true,
      requires_attachment: false,
      max_balance: null,
      carry_over_days: 0,
      active: true,
      sort_order: 1,
    },
    {
      id: SICK_LEAVE_ID,
      name: "Sick leave",
      code: "SICK",
      days_per_year: 10,
      accrual_method: "upfront",
      paid: true,
      requires_approval: true,
      requires_attachment: false,
      max_balance: null,
      carry_over_days: 0,
      active: true,
      sort_order: 2,
    },
    {
      id: FAMILY_LEAVE_ID,
      name: "Family responsibility",
      code: "FAMILY",
      days_per_year: 3,
      accrual_method: "upfront",
      paid: true,
      requires_approval: true,
      requires_attachment: false,
      max_balance: null,
      carry_over_days: 0,
      active: true,
      sort_order: 3,
    },
  ];
}

function leaveRequestRow(person, type, status, startOffset, days, reason, rejection) {
  const start = isoShift(startOffset, 0);
  const end = isoShift(startOffset + Math.max(days, 1) - 1, 0);
  return {
    id: `25000001-0000-4000-8000-${String(startOffset + 20).padStart(12, "0")}`,
    employee_id: person.id,
    payroll_profile_id: person.payroll_profile_id,
    leave_type_id: type.id,
    start_date: start,
    end_date: end,
    working_days: days,
    status,
    reason,
    rejection_reason: rejection || null,
    leave_types: { name: type.name, code: type.code, paid: true },
    payroll_profiles: {
      full_name: person.full_name,
      employee_number: person.employee_number,
      department: person.department,
      email: person.email,
      membership_id: person.id,
    },
  };
}

function ensureLeaveRequests() {
  const bag = demoTable("leave_requests");
  if (bag.length) return bag;
  const people = roster();
  const types = leaveTypeCatalog();
  const annual = types[0];
  const sick = types[1];
  if (people[0]) bag.push(leaveRequestRow(people[0], annual, "pending", 5, 3, "Family visit"));
  if (people[1]) bag.push(leaveRequestRow(people[1], sick, "approved", -1, 2, "Flu"));
  if (people[2]) bag.push(leaveRequestRow(people[2], annual, "rejected", 18, 4, "Holiday", "Peak service week"));
  touchDemoDataset();
  return bag;
}

function leaveCounts() {
  const rows = ensureLeaveRequests();
  const today = johannesburgToday();
  return {
    pending: rows.filter((row) => row.status === "pending").length,
    approved: rows.filter((row) => row.status === "approved").length,
    rejected: rows.filter((row) => row.status === "rejected").length,
    upcoming: rows.filter((row) => row.status === "approved" && row.start_date >= today).length,
    on_leave_today: rows.filter(
      (row) => row.status === "approved" && row.start_date <= today && row.end_date >= today
    ).length,
  };
}

function leaveEmployees() {
  return roster()
    .map((row) => ({
      id: row.id,
      employee_id: row.id,
      membership_id: row.id,
      payroll_profile_id: row.payroll_profile_id,
      user_id: row.user_id,
      employee_number: row.employee_number,
      full_name: row.full_name,
      label: row.full_name,
      email: row.email,
      department: row.department,
      job_title: row.job_title,
      manager_membership_id: row.manager_membership_id,
      employment_status: row.employment_status,
      disabled_at: row.disabled_at,
      role: row.role,
      job_function: row.job_function,
    }))
    .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
}

function filterLeaveRequests(query) {
  let rows = ensureLeaveRequests();
  if (query.status) rows = rows.filter((row) => row.status === query.status);
  if (query.employee_id) rows = rows.filter((row) => row.employee_id === query.employee_id);
  if (query.leave_type_id) rows = rows.filter((row) => row.leave_type_id === query.leave_type_id);
  if (query.department) {
    const dept = String(query.department).trim().toLowerCase();
    rows = rows.filter((row) => String(row.payroll_profiles?.department || "").toLowerCase() === dept);
  }
  if (query.manager_id) {
    const reports = new Set(
      roster()
        .filter((person) => person.manager_membership_id === query.manager_id)
        .map((person) => person.id)
    );
    rows = rows.filter((row) => reports.has(row.employee_id));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.from || ""))) {
    rows = rows.filter((row) => row.end_date >= query.from);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to || ""))) {
    rows = rows.filter((row) => row.start_date <= query.to);
  }
  return rows;
}

function leaveCalendar(query) {
  const from = String(query.start || "");
  const to = String(query.end || "");
  return ensureLeaveRequests()
    .filter((row) => row.status === "pending" || row.status === "approved")
    .filter((row) => !to || row.start_date <= to)
    .filter((row) => !from || row.end_date >= from)
    .map((row) => ({
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

function decideLeave(id, action, body) {
  const row = ensureLeaveRequests().find((item) => item.id === decodeURIComponent(id));
  if (!row) {
    const err = new Error("Leave request not found.");
    err.status = 404;
    throw err;
  }
  if (action === "cancel") {
    if (row.status !== "pending" && row.status !== "approved") {
      const err = new Error("Only pending or approved leave can be cancelled.");
      err.status = 409;
      throw err;
    }
    row.status = "cancelled";
  } else if (row.status !== "pending") {
    const err = new Error("Only pending requests can be decided.");
    err.status = 409;
    throw err;
  } else if (action === "approve") {
    row.status = "approved";
  } else {
    const reason = String(body?.reason || "").trim();
    if (!reason) {
      const err = new Error("A rejection reason is required.");
      err.status = 400;
      throw err;
    }
    row.status = "rejected";
    row.rejection_reason = reason;
  }
  touchDemoDataset();
  return row;
}

function payrollProfiles() {
  return roster().map((row) => ({
    id: row.payroll_profile_id,
    membership_id: row.id,
    employee_number: row.employee_number,
    full_name: row.full_name,
    email: row.email,
    job_title: row.job_title,
    department: row.department,
    base_salary: row.base_salary,
    pay_type: row.pay_type,
    user_id: row.user_id,
  }));
}

/**
 * Local answer for payroll and workforce HTTP calls while the demo sandbox is on.
 * Returns null when this path is not part of the demo dataset.
 * @param {string} path
 */
export function demoPayrollRequest(path, { method = "GET", body } = {}) {
  const bare = String(path || "").split("?")[0];
  if (bare === "/api/leave/types") return leaveTypeCatalog();
  if (bare === "/api/leave/employees") return leaveEmployees();
  if (bare === "/api/leave/requests") return filterLeaveRequests(parseQuery(path));
  if (bare === "/api/leave/calendar") return leaveCalendar(parseQuery(path));
  if (bare === "/api/leave/me") return { requests: ensureLeaveRequests(), balances: [] };
  const decision = bare.match(/^\/api\/leave\/requests\/([^/]+)\/(approve|reject|cancel)$/);
  if (decision && String(method).toUpperCase() === "POST") {
    return decideLeave(decision[1], decision[2], body);
  }
  if (bare === "/api/company/workforce-summary") return workforceSummary();
  if (bare === "/api/company/workforce-organogram") return organogram();
  if (bare === "/api/company/workforce-people-calendar") return peopleCalendar(parseQuery(path));
  if (bare === "/api/company/employees") return employeeList(parseQuery(path));
  if (bare === "/api/payroll/reports") return payrollReport(parseQuery(path));
  if (bare === "/api/payroll/profiles") return payrollProfiles();
  if (bare === "/api/payroll/overview") return payrollOverview();
  const runMatch = bare.match(/^\/api\/payroll\/runs\/([^/]+)(\/reconciliation)?$/);
  if (runMatch) {
    if (runMatch[2]) return payrollReconciliation(decodeURIComponent(runMatch[1]));
    return payRunById(decodeURIComponent(runMatch[1]));
  }
  return null;
}
