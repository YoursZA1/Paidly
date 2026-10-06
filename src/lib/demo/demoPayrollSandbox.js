import { buildPayrollReport, PAYROLL_REPORT_TYPES, payrollReportToCsv } from "@shared/payroll/payrollReports.js";
import { demoTable } from "./demoSandboxStore.js";

const RUN_ID = "23000001-0000-4000-8000-000000000001";

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
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

function itemsFromSeed() {
  const slips = demoTable("payslips") || [];
  const staff = demoTable("employees") || [];
  return slips.map((slip, i) => {
    const person = staff[i] || {};
    const gross = money(slip.gross_pay);
    const net = money(slip.net_pay);
    const uif = Math.min(money(gross * 0.01), 177.12);
    const paye = money(Math.max(0, gross - net - uif));
    const period = String(slip.pay_period || "").slice(0, 7);
    const start = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : null;
    const end = lastDay(period);
    return {
      pay_run_id: RUN_ID,
      membership_id: person.id || slip.id,
      employee_number: `EMP-${String(i + 1).padStart(3, "0")}`,
      employee_name: slip.employee_name || person.name || "Employee",
      department: slip.job_title || person.job_title || null,
      job_title: slip.job_title || person.job_title || null,
      period_label: periodLabel(period),
      period_start: start,
      period_end: end,
      pay_date: end,
      run_status: "finalized",
      run_type: "regular",
      payslip_number: `PS-${period.replace("-", "") || "000000"}-${String(i + 1).padStart(3, "0")}`,
      payslip_status: slip.status || "paid",
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
    leave: { pending: 0, approved: 0, rejected: 0, upcoming: 0, on_leave_today: 0 },
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
export function demoPayrollRequest(path) {
  const bare = String(path || "").split("?")[0];
  if (bare === "/api/company/workforce-summary") return workforceSummary();
  if (bare === "/api/payroll/reports") return payrollReport(parseQuery(path));
  return null;
}
