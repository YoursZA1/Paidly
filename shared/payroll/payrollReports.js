/**
 * Pure payroll compliance report aggregators.
 * Read finalized pay_run_items — never recalculate locked periods.
 */

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function codeOf(line) {
  return String(line?.code || "").toUpperCase();
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
      continue;
    }
    if (code === "UIF_EMPLOYER") {
      uifEmployer += er > 0 ? er : ee;
      continue;
    }
    if (code === "SDL") {
      sdlEmployer += er > 0 ? er : ee;
      continue;
    }
    if (line?.employee_portion === false || er > 0) {
      otherEmployer += er > 0 ? er : ee;
    }
  }

  return {
    paye: money(paye),
    uif_employee: money(uifEmployee),
    uif_employer: money(uifEmployer),
    sdl_employer: money(sdlEmployer),
    other_employer: money(otherEmployer),
    employer_statutory: money(uifEmployer + sdlEmployer + otherEmployer),
  };
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildUifReportRows(items) {
  const rows = [];
  let employeeTotal = 0;
  let employerTotal = 0;
  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const employee = s.uif_employee;
    const employer = s.uif_employer;
    const total = money(employee + employer);
    employeeTotal += employee;
    employerTotal += employer;
    rows.push({
      membership_id: item.membership_id || null,
      employee_number: item.employee_number || null,
      employee_name: item.employee_name || "—",
      employee_contribution: employee,
      employer_contribution: employer,
      total,
    });
  }
  return {
    rows,
    totals: {
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
  let total = 0;
  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const paye = s.paye;
    total += paye;
    rows.push({
      membership_id: item.membership_id || null,
      employee_number: item.employee_number || null,
      employee_name: item.employee_name || "—",
      paye_deducted: paye,
    });
  }
  return {
    rows,
    totals: { paye_deducted: money(total) },
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
  let otherDeductions = 0;
  let employerStatutory = 0;
  let net = 0;

  for (const item of items || []) {
    const s = statutoryAmounts(item.statutory_deductions);
    const itemGross = money(item.gross_pay);
    const itemNet = money(item.net_pay);
    const itemDeductions = money(item.total_deductions);
    const itemOther = money(
      (Array.isArray(item.other_deductions) ? item.other_deductions : []).reduce(
        (sum, line) => sum + money(line?.amount),
        0
      )
    );
    gross += itemGross;
    deductions += itemDeductions;
    paye += s.paye;
    uifEmployee += s.uif_employee;
    uifEmployer += s.uif_employer;
    otherDeductions += itemOther;
    employerStatutory += s.employer_statutory;
    net += itemNet;
  }

  const employerCost = money(gross + employerStatutory);
  return {
    employee_count: (items || []).length,
    gross_payroll: money(gross),
    deductions: money(deductions),
    paye: money(paye),
    uif_employee: money(uifEmployee),
    uif_employer: money(uifEmployer),
    uif_total: money(uifEmployee + uifEmployer),
    other_deductions: money(otherDeductions),
    employer_statutory: money(employerStatutory),
    total_employer_cost: employerCost,
    net_payroll: money(net),
  };
}

/**
 * @param {Array<Record<string, unknown>>} items
 */
export function buildNetPayRegister(items) {
  const rows = [];
  let total = 0;
  for (const item of items || []) {
    const net = money(item.net_pay);
    total += net;
    rows.push({
      membership_id: item.membership_id || null,
      employee_number: item.employee_number || null,
      employee_name: item.employee_name || "—",
      net_pay: net,
    });
  }
  return {
    rows,
    totals: { net_pay: money(total) },
  };
}

export const PAYROLL_REPORT_TYPES = ["uif", "paye", "summary", "net_pay"];

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
  const err = new Error("Unknown payroll report type.");
  err.status = 400;
  throw err;
}
