// @ts-check
/**
 * Payslip presentation model. Reads the finalized values stored on the payslip (copied from the
 * pay_run_item at finalisation) and arranges them for display. It never calculates PAYE, UIF,
 * gross, net or leave deductions — only groups the stored lines.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(v) {
  return Math.round(num(v) * 100) / 100;
}

const PENSION_RE = /pension|provident|retirement/i;
const MEDICAL_RE = /medical/i;

function lineKind(line) {
  const text = `${line?.type || ""} ${line?.code || ""}`;
  if (PENSION_RE.test(text)) return "pension";
  if (MEDICAL_RE.test(text)) return "medical";
  return "other";
}

/** "80 h × R 100,00" style unit detail, from the frozen calculation inputs. */
function unitDetail(units, unit, rate, fmt) {
  if (!units || !rate) return null;
  const label = unit === "hours" ? "h" : unit === "days" ? "days" : unit || "";
  return `${units} ${label} × ${fmt(rate)}`;
}

/**
 * @param {Record<string, any>} payslip
 * @param {{ formatMoney?: (n: number) => string }} [opts]
 */
export function buildPayslipView(payslip = {}, opts = {}) {
  const fmt = opts.formatMoney || ((n) => round2(n).toFixed(2));
  const calc = payslip?.calculation_breakdown && typeof payslip.calculation_breakdown === "object" ? payslip.calculation_breakdown : {};
  const inputs = calc.inputs && typeof calc.inputs === "object" ? calc.inputs : {};

  // Earnings: the engine's lines when present (they add up to gross); older payslips fall back to
  // basic + stored allowances (which already include overtime — never recomputed from hours × rate).
  const earnings = [];
  const breakdownLines = Array.isArray(calc.earnings) ? calc.earnings : null;
  const basic = num(payslip.basic_salary ?? calc.basic);
  const basicDetail =
    inputs.pay_type === "hourly" || inputs.pay_type === "daily"
      ? unitDetail(inputs.units, inputs.unit, inputs.unit_rate, fmt)
      : null;
  if (basic) earnings.push({ code: "BASIC", label: inputs.pay_type === "hourly" ? "Ordinary pay" : inputs.pay_type === "daily" ? "Daily wages" : "Basic salary", detail: basicDetail, amount: round2(basic), cash: true });
  const source = breakdownLines || (Array.isArray(payslip.allowances) ? payslip.allowances : []);
  for (const line of source) {
    const code = String(line?.code || "").toUpperCase();
    if (code === "BASIC" || String(line?.type || "") === "basic") continue;
    const cash = line?.cash !== false && String(line?.type || "") !== "fringe_benefit";
    let detail = null;
    if (code === "OT" || line?.type === "overtime") {
      detail = unitDetail(num(payslip.overtime_hours ?? inputs.overtime_hours), "hours", num(payslip.overtime_rate ?? inputs.overtime_rate), fmt);
    }
    if (code === "UNPAID") detail = inputs.unpaid_leave_days ? `${inputs.unpaid_leave_days} unpaid day(s) of ${inputs.working_days || "?"}` : null;
    earnings.push({ code, label: String(line?.name || code || "Earning"), detail, amount: round2(line?.amount), cash });
  }
  const cashEarnings = earnings.filter((l) => l.cash);
  const fringe = earnings.filter((l) => !l.cash);

  // Deductions: statutory amounts from their stored columns, then each other line once.
  const deductions = [
    { code: "PAYE", label: "PAYE (income tax)", amount: round2(payslip.tax_deduction) },
    { code: "UIF", label: "UIF (employee 1%)", amount: round2(payslip.uif_deduction) },
  ];
  for (const line of Array.isArray(payslip.other_deductions) ? payslip.other_deductions : []) {
    if (line?.employee_portion === false) continue;
    const kind = lineKind(line);
    deductions.push({
      code: String(line?.code || "").toUpperCase(),
      label: kind === "pension" ? String(line?.name || "Retirement fund") : kind === "medical" ? String(line?.name || "Medical aid") : String(line?.name || "Deduction"),
      amount: round2(line?.amount),
      kind,
    });
  }

  const ec = payslip.employer_contributions || calc.employer_contributions || null;
  const employerContributions = ec
    ? [
        { label: "UIF (employer 1%)", amount: round2(ec.uif) },
        { label: "Skills Development Levy", amount: round2(ec.sdl) },
        { label: "Other statutory", amount: round2(ec.other_statutory) },
        { label: "Employer benefit contributions", amount: round2(ec.benefits) },
      ].filter((r) => r.amount > 0)
    : [];

  const ytd = payslip.ytd && typeof payslip.ytd === "object" ? payslip.ytd : null;
  const taxYear = payslip.tax_year || calc.tax_year?.label || null;

  return {
    taxYear,
    payType: inputs.pay_type || null,
    earnings: cashEarnings,
    fringeBenefits: fringe,
    grossPay: round2(payslip.gross_pay),
    deductions: deductions.filter((d) => d.amount !== 0 || d.code === "PAYE" || d.code === "UIF"),
    totalDeductions: round2(payslip.total_deductions),
    netPay: round2(payslip.net_pay),
    employerContributions,
    employerContributionsTotal: ec ? round2(ec.total) : 0,
    ytd: ytd
      ? [
          { label: "Gross earnings", amount: round2(ytd.gross) },
          { label: "Taxable earnings", amount: round2(ytd.taxable) },
          { label: "PAYE", amount: round2(ytd.paye) },
          { label: "UIF", amount: round2(ytd.uif) },
          { label: "Other deductions", amount: round2(ytd.other_deductions) },
          { label: "Net pay", amount: round2(ytd.net) },
        ]
      : [],
    // Display check only: stored lines should add up to the stored totals.
    consistent:
      Math.abs(cashEarnings.reduce((s, l) => s + l.amount, 0) - round2(payslip.gross_pay)) < 0.011 &&
      Math.abs(deductions.reduce((s, d) => s + d.amount, 0) - round2(payslip.total_deductions)) < 0.011,
  };
}

export const PAY_TYPE_LABELS = Object.freeze({
  monthly_salary: "Monthly salary",
  hourly: "Hourly",
  daily: "Daily",
  other: "Other",
});
