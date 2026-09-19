/**
 * Pure payroll compliance report aggregators.
 * Read finalized pay_run_items — never recalculate locked periods and never
 * derive history from the employee's current profile.
 *
 * Items may carry report context attached by the server
 * (see {@link attachReportContext}): period, department, payslip status.
 */

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function codeOf(line) {
  return String(line?.code || "").toUpperCase();
}

function sumLines(lines) {
  return money((Array.isArray(lines) ? lines : []).reduce((sum, line) => sum + money(line?.amount), 0));
}

/**
 * @param {Array<{ code?: string, amount?: number, employer_amount?: number, employee_portion?: boolean }>|null|undefined} statutory
 */
export function statutoryAmounts(statutory) {
  const lines = Array.isArray(statutory) ? statutory : [];
  let paye = 0;
  let uifEmployee = 0;
  let uifEmployer = 0;
  let sdlEmployer = 0;
  let otherEmployer = 0;
  let otherEmployee = 0;
  let uifBase = null;

  for (const line of lines) {
    const code = codeOf(line);
    const ee = money(line?.amount);
    const er = money(line?.employer_amount);
    if (code === "PAYE") {
      paye += ee;
      continue;
    }
    if (code === "UIF") {
      uifEmployee += ee;
      if (er > 0) uifEmployer += er;
      if (line?.base_amount != null && uifBase == null) uifBase = money(line.base_amount);
      continue;
    }
    if (code === "UIF_EMPLOYER") {
      uifEmployer += er > 0 ? er : ee;
      if (line?.base_amount != null && uifBase == null) uifBase = money(line.base_amount);
      continue;
    }
    if (code === "SDL") {
      sdlEmployer += er > 0 ? er : ee;
      continue;
    }
    if (line?.employee_portion === false || er > 0) {
      otherEmployer += er > 0 ? er : ee;
      continue;
    }
    otherEmployee += ee;
  }

  return {
    paye: money(paye),
    uif_employee: money(uifEmployee),
    uif_employer: money(uifEmployer),
    uif_base: uifBase,
    sdl_employer: money(sdlEmployer),
    other_employer: money(otherEmployer),
    other_statutory_employee: money(otherEmployee),
    employer_statutory: money(uifEmployer + sdlEmployer + otherEmployer),
  };
}

/**
 * Attach frozen period / department / status context to items for reporting.
 * Department prefers the calculation-time profile snapshot, then the issued payslip.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {{ runsById?: Map<string, Record<string, unknown>>, payslipsById?: Map<string, Record<string, unknown>> }} [ctx]
 */
export function attachReportContext(items, ctx = {}) {
  const runsById = ctx.runsById || new Map();
  const payslipsById = ctx.payslipsById || new Map();
  return (items || []).map((item) => {
    const run = runsById.get(String(item.pay_run_id)) || null;
    const slip = item.payslip_id ? payslipsById.get(String(item.payslip_id)) || null : null;
    const snap = item?.calculation?.profile_snapshot || {};
    return {
      ...item,
      department: item.department || snap.department || slip?.department || null,
      job_title: item.job_title || snap.job_title || slip?.position || null,
      period_label: item.period_label || run?.period_label || null,
      period_start: item.period_start || run?.period_start || null,
      period_end: item.period_end || run?.period_end || null,
      pay_date: item.pay_date || run?.pay_date || null,
      run_status: item.run_status || run?.status || null,
      run_type: item.run_type || run?.run_type || null,
      payslip_number: item.payslip_number || slip?.payslip_number || null,
      payslip_status: item.payslip_status || slip?.status || null,
    };
  });
}

/**
 * @param {Array<Record<string, unknown>>} items
 * @param {{ department?: string|null, membership_id?: string|null }} [filters]
 */
export function filterReportItems(items, filters = {}) {
  const dept = String(filters.department || "").trim().toLowerCase();
  const member = String(filters.membership_id || "").trim();
  return (items || []).filter((item) => {
    if (dept && String(item.department || "").trim().toLowerCase() !== dept) return false;
    if (member && String(item.membership_id || "") !== member) return false;
    return true;
  });
}

/**
 * Group rows by pay run so multi-month ranges show a monthly total per period.
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} amountKeys
 */
export function totalsByPeriod(rows, amountKeys) {
  const byRun = new Map();
  for (const row of rows || []) {
    const key = String(row.pay_run_id || "—");
    if (!byRun.has(key)) {
      const totals = {};
      for (const k of amountKeys) totals[k] = 0;
      byRun.set(key, {
        pay_run_id: row.pay_run_id || null,
        period_label: row.period_label || null,
        period_start: row.period_start || null,
        period_end: row.period_end || null,
        employee_count: 0,
        totals,
      });
    }
    const bucket = byRun.get(key);
    bucket.employee_count += 1;
    for (const k of amountKeys) bucket.totals[k] = money(bucket.totals[k] + money(row[k]));
  }
  return [...byRun.values()].sort((a, b) => String(b.period_start || "").localeCompare(String(a.period_start || "")));
}

function rowBase(item) {
  return {
    pay_run_id: item.pay_run_id || null,
    membership_id: item.membership_id || null,
    employee_number: item.employee_number || null,
    employee_name: item.employee_name || "—",
    department: item.department || null,
    period_label: item.period_label || null,
    period_start: item.period_start || null,
    period_end: item.period_end || null,
  };
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const byPeriod = String(b.period_start || "").localeCompare(String(a.period_start || ""));
    if (byPeriod) return byPeriod;
    return String(a.employee_name).localeCompare(String(b.employee_name), undefined, { sensitivity: "base" });
  });
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildUifReportRows(items) {
  const rows = [];
  let employeeTotal = 0;
  let employerTotal = 0;
  let baseTotal = 0;
  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const employee = s.uif_employee;
    const employer = s.uif_employer;
    const total = money(employee + employer);
    // Historical runs predate base_amount on statutory lines; gross is the rule base there.
    const base = s.uif_base != null ? s.uif_base : money(item.gross_pay);
    employeeTotal += employee;
    employerTotal += employer;
    baseTotal += base;
    rows.push({
      ...rowBase(item),
      uif_base: base,
      employee_contribution: employee,
      employer_contribution: employer,
      total,
    });
  }
  sortRows(rows);
  return {
    rows,
    by_period: totalsByPeriod(rows, ["uif_base", "employee_contribution", "employer_contribution", "total"]),
    totals: {
      uif_base: money(baseTotal),
      employee_contribution: money(employeeTotal),
      employer_contribution: money(employerTotal),
      total: money(employeeTotal + employerTotal),
    },
  };
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildPayeReportRows(items) {
  const rows = [];
  const totals = { gross_pay: 0, paye_deducted: 0, uif_employee: 0, other_deductions: 0, total_deductions: 0 };
  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const other = money(sumLines(item.other_deductions) + s.other_statutory_employee);
    const row = {
      ...rowBase(item),
      gross_pay: money(item.gross_pay),
      paye_deducted: s.paye,
      uif_employee: s.uif_employee,
      other_deductions: other,
      total_deductions: money(item.total_deductions),
    };
    for (const k of Object.keys(totals)) totals[k] += row[k];
    rows.push(row);
  }
  sortRows(rows);
  for (const k of Object.keys(totals)) totals[k] = money(totals[k]);
  return {
    rows,
    by_period: totalsByPeriod(rows, ["gross_pay", "paye_deducted"]),
    totals,
  };
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildPayrollSummary(items) {
  let gross = 0;
  let deductions = 0;
  let paye = 0;
  let uifEmployee = 0;
  let uifEmployer = 0;
  let sdlEmployer = 0;
  let otherDeductions = 0;
  let employerStatutory = 0;
  let net = 0;

  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    gross += money(item.gross_pay);
    deductions += money(item.total_deductions);
    paye += s.paye;
    uifEmployee += s.uif_employee;
    uifEmployer += s.uif_employer;
    sdlEmployer += s.sdl_employer;
    otherDeductions += sumLines(item.other_deductions);
    employerStatutory += s.employer_statutory;
    net += money(item.net_pay);
  }

  const employerCost = money(gross + employerStatutory);
  return {
    employee_count: new Set((items || []).map((i) => i.membership_id || i.id)).size,
    gross_payroll: money(gross),
    deductions: money(deductions),
    paye: money(paye),
    uif_employee: money(uifEmployee),
    uif_employer: money(uifEmployer),
    uif_total: money(uifEmployee + uifEmployer),
    sdl_employer: money(sdlEmployer),
    other_deductions: money(otherDeductions),
    employer_statutory: money(employerStatutory),
    total_employer_cost: employerCost,
    net_payroll: money(net),
  };
}

function itemStatus(item) {
  return String(item.payslip_status || item.run_status || item.status || "").toLowerCase() || null;
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildNetPayRegister(items) {
  const rows = [];
  const totals = { gross_pay: 0, total_deductions: 0, net_pay: 0 };
  for (const item of items || []) {
    const row = {
      ...rowBase(item),
      gross_pay: money(item.gross_pay),
      total_deductions: money(item.total_deductions),
      net_pay: money(item.net_pay),
      status: itemStatus(item),
    };
    totals.gross_pay += row.gross_pay;
    totals.total_deductions += row.total_deductions;
    totals.net_pay += row.net_pay;
    rows.push(row);
  }
  sortRows(rows);
  return {
    rows,
    by_period: totalsByPeriod(rows, ["gross_pay", "total_deductions", "net_pay"]),
    totals: {
      gross_pay: money(totals.gross_pay),
      total_deductions: money(totals.total_deductions),
      net_pay: money(totals.net_pay),
    },
  };
}

/**
 * One employee across finalized periods (newest first).
 * @param {Array<Record<string, unknown>>} items
 */
export function buildEmployeePayrollHistory(items) {
  const rows = [];
  const totals = { gross_pay: 0, paye: 0, uif_employee: 0, other_deductions: 0, total_deductions: 0, net_pay: 0 };
  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const row = {
      ...rowBase(item),
      pay_date: item.pay_date || null,
      payslip_number: item.payslip_number || null,
      gross_pay: money(item.gross_pay),
      paye: s.paye,
      uif_employee: s.uif_employee,
      other_deductions: money(sumLines(item.other_deductions) + s.other_statutory_employee),
      total_deductions: money(item.total_deductions),
      net_pay: money(item.net_pay),
      status: itemStatus(item),
    };
    for (const k of Object.keys(totals)) totals[k] += row[k];
    rows.push(row);
  }
  sortRows(rows);
  for (const k of Object.keys(totals)) totals[k] = money(totals[k]);
  const first = rows[0] || null;
  return {
    employee: first
      ? {
          membership_id: first.membership_id,
          employee_name: first.employee_name,
          employee_number: first.employee_number,
          department: first.department,
        }
      : null,
    rows,
    totals,
  };
}

export const PAYROLL_REPORT_TYPES = ["uif", "paye", "summary", "net_pay", "employee_history"];

/**
 * @param {string} type
 * @param {Array<Record<string, unknown>>} items
 */
export function buildPayrollReport(type, items) {
  const key = String(type || "").toLowerCase();
  if (key === "uif") return { type: "uif", ...buildUifReportRows(items) };
  if (key === "paye") return { type: "paye", ...buildPayeReportRows(items) };
  if (key === "summary") return { type: "summary", ...buildPayrollSummary(items) };
  if (key === "net_pay") return { type: "net_pay", ...buildNetPayRegister(items) };
  if (key === "employee_history") return { type: "employee_history", ...buildEmployeePayrollHistory(items) };
  const err = new Error("Unknown payroll report type.");
  err.status = 400;
  throw err;
}

export const PAYROLL_REPORT_TITLES = Object.freeze({
  uif: "UIF Report",
  paye: "PAYE Report",
  summary: "Payroll Summary",
  net_pay: "Net Pay Register",
  employee_history: "Employee Payroll History",
});

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function amount(n) {
  return money(n).toFixed(2);
}

/**
 * CSV for an assembled report. Header block names company, period, generation
 * time and filters so an exported file is self-describing.
 *
 * @param {Record<string, any>} report buildPayrollReport output
 * @param {{ companyName?: string|null, registrationNumber?: string|null, payeReference?: string|null, uifReference?: string|null, periodLabel?: string|null, generatedAt?: string, currency?: string|null, filters?: Record<string, unknown> }} meta
 */
export function payrollReportToCsv(report, meta = {}) {
  const type = String(report?.type || "");
  const lines = [];
  const push = (cells) => lines.push(cells.map(csvCell).join(","));

  push(["Report", PAYROLL_REPORT_TITLES[type] || type]);
  push(["Company", meta.companyName || ""]);
  if (meta.registrationNumber) push(["Registration number", meta.registrationNumber]);
  if (type === "paye" && meta.payeReference) push(["PAYE reference", meta.payeReference]);
  if (type === "uif" && meta.uifReference) push(["UIF reference", meta.uifReference]);
  push(["Payroll period", meta.periodLabel || ""]);
  push(["Generated", meta.generatedAt || new Date().toISOString()]);
  if (meta.currency) push(["Currency", meta.currency]);
  for (const [k, v] of Object.entries(meta.filters || {})) {
    if (v != null && v !== "") push([`Filter: ${k}`, v]);
  }
  push(["Source", "Finalised pay runs (historical records, not recalculated)"]);
  lines.push("");

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const t = report?.totals || {};

  if (type === "uif") {
    push(["Employee", "Employee number", "Department", "Payroll period", "UIF remuneration", "Employee UIF", "Employer UIF", "Total UIF"]);
    for (const r of rows) {
      push([r.employee_name, r.employee_number, r.department, r.period_label, amount(r.uif_base), amount(r.employee_contribution), amount(r.employer_contribution), amount(r.total)]);
    }
    push(["TOTAL UIF LIABILITY", "", "", "", amount(t.uif_base), amount(t.employee_contribution), amount(t.employer_contribution), amount(t.total)]);
    appendPeriodTotals(push, report, ["employee_contribution", "employer_contribution", "total"], ["Employee UIF", "Employer UIF", "Total UIF"]);
  } else if (type === "paye") {
    push(["Employee", "Employee number", "Department", "Payroll period", "Gross remuneration", "PAYE deducted", "UIF (employee)", "Other deductions", "Total deductions"]);
    for (const r of rows) {
      push([r.employee_name, r.employee_number, r.department, r.period_label, amount(r.gross_pay), amount(r.paye_deducted), amount(r.uif_employee), amount(r.other_deductions), amount(r.total_deductions)]);
    }
    push(["TOTAL PAYE", "", "", "", amount(t.gross_pay), amount(t.paye_deducted), amount(t.uif_employee), amount(t.other_deductions), amount(t.total_deductions)]);
    appendPeriodTotals(push, report, ["gross_pay", "paye_deducted"], ["Gross remuneration", "PAYE"]);
  } else if (type === "net_pay") {
    push(["Employee", "Employee number", "Department", "Payroll period", "Gross pay", "Total deductions", "Net pay", "Status"]);
    for (const r of rows) {
      push([r.employee_name, r.employee_number, r.department, r.period_label, amount(r.gross_pay), amount(r.total_deductions), amount(r.net_pay), r.status]);
    }
    push(["TOTAL NET PAY", "", "", "", amount(t.gross_pay), amount(t.total_deductions), amount(t.net_pay), ""]);
    appendPeriodTotals(push, report, ["gross_pay", "total_deductions", "net_pay"], ["Gross pay", "Deductions", "Net pay"]);
  } else if (type === "employee_history") {
    if (report?.employee) {
      push(["Employee", report.employee.employee_name]);
      push(["Employee number", report.employee.employee_number || ""]);
      lines.push("");
    }
    push(["Payroll period", "Pay date", "Payslip", "Gross pay", "PAYE", "UIF (employee)", "Other deductions", "Total deductions", "Net pay", "Status"]);
    for (const r of rows) {
      push([r.period_label, r.pay_date, r.payslip_number, amount(r.gross_pay), amount(r.paye), amount(r.uif_employee), amount(r.other_deductions), amount(r.total_deductions), amount(r.net_pay), r.status]);
    }
    push(["TOTAL", "", "", amount(t.gross_pay), amount(t.paye), amount(t.uif_employee), amount(t.other_deductions), amount(t.total_deductions), amount(t.net_pay), ""]);
  } else if (type === "summary") {
    push(["Metric", "Amount"]);
    const metrics = [
      ["Employees", report.employee_count],
      ["Gross payroll", amount(report.gross_payroll)],
      ["Total deductions", amount(report.deductions)],
      ["PAYE", amount(report.paye)],
      ["UIF (employee)", amount(report.uif_employee)],
      ["UIF (employer)", amount(report.uif_employer)],
      ["UIF total liability", amount(report.uif_total)],
      ["SDL (employer)", amount(report.sdl_employer)],
      ["Other deductions", amount(report.other_deductions)],
      ["Employer statutory contributions", amount(report.employer_statutory)],
      ["Total employer payroll cost", amount(report.total_employer_cost)],
      ["Net payroll", amount(report.net_payroll)],
    ];
    for (const m of metrics) push(m);
  }
  return lines.join("\n");
}

function appendPeriodTotals(push, report, keys, labels) {
  const periods = Array.isArray(report?.by_period) ? report.by_period : [];
  if (periods.length < 2) return;
  push([]);
  push(["Monthly totals"]);
  push(["Payroll period", "Employees", ...labels]);
  for (const p of periods) {
    push([p.period_label || p.period_start, p.employee_count, ...keys.map((k) => amount(p.totals?.[k]))]);
  }
}

/**
 * Safe filename stem for a report export.
 * @param {string} type
 * @param {string|null|undefined} periodLabel
 */
export function payrollReportFilename(type, periodLabel) {
  const stem = String(PAYROLL_REPORT_TITLES[type] || type || "payroll-report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const period = String(periodLabel || "all-periods")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem}-${period || "period"}.csv`;
}
