import { ROUND_MONEY } from "./constants.js";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lineAmount(line) {
  return ROUND_MONEY(asNumber(line?.amount));
}

/**
 * Apply a versioned statutory rule. Rates live in the rule payload, never in this module.
 *
 * calculation_type:
 * - percent: value.rate * base
 * - capped_percent: min(rate * base, cap)
 * - fixed: value.amount
 * - tax_brackets: annualised PAYE-style brackets (value.brackets, value.rebate, value.periods_per_year)
 *
 * @param {{ calculation_type: string, value: Record<string, unknown>, code?: string, name?: string, employee_portion?: boolean }} rule
 * @param {{ gross: number, basic: number, taxableIncome: number, pension: number, medical: number }} bases
 */
export function applyStatutoryRule(rule, bases) {
  const type = String(rule?.calculation_type || "").toLowerCase();
  const value = rule?.value && typeof rule.value === "object" ? rule.value : {};
  const employeePortion = rule?.employee_portion !== false;
  if (!employeePortion) {
    const employerCost = computeRuleAmount(type, value, bases);
    return {
      code: String(rule?.code || "STAT"),
      name: String(rule?.name || rule?.code || "Statutory"),
      amount: 0,
      employer_amount: ROUND_MONEY(employerCost),
      employee_portion: false,
    };
  }
  const amount = computeRuleAmount(type, value, bases);
  return {
    code: String(rule?.code || "STAT"),
    name: String(rule?.name || rule?.code || "Statutory"),
    amount: ROUND_MONEY(amount),
    employer_amount: 0,
    employee_portion: true,
  };
}

function computeRuleAmount(type, value, bases) {
  const gross = asNumber(bases.gross);
  const taxable = asNumber(bases.taxableIncome);
  const basic = asNumber(bases.basic);
  const baseKey = String(value.base || "gross").toLowerCase();
  const base =
    baseKey === "taxable" ? taxable : baseKey === "basic" ? basic : gross;

  if (type === "fixed") {
    return asNumber(value.amount);
  }
  if (type === "percent") {
    return base * asNumber(value.rate);
  }
  if (type === "capped_percent") {
    const raw = base * asNumber(value.rate);
    const cap = value.cap == null ? Infinity : asNumber(value.cap);
    return Math.min(raw, cap);
  }
  if (type === "tax_brackets") {
    return taxBracketPeriodAmount(value, {
      annualTaxable: taxable,
      monthlyMedical: asNumber(bases.medical),
      monthlyPension: asNumber(bases.pension),
    });
  }
  return 0;
}

/**
 * Generic bracket tax. Periods_per_year defaults to 12 (monthly payroll).
 * Rebates/credits are taken from the rule value — not from application constants.
 */
function taxBracketPeriodAmount(value, { annualTaxable, monthlyMedical, monthlyPension }) {
  const periods = Math.max(1, asNumber(value.periods_per_year) || 12);
  const brackets = Array.isArray(value.brackets) ? value.brackets : [];
  let tax = 0;
  for (const bracket of brackets) {
    const min = asNumber(bracket.min);
    const max = bracket.max == null || bracket.max === "" ? Infinity : asNumber(bracket.max);
    if (annualTaxable >= min && annualTaxable <= max) {
      const baseAmount = asNumber(bracket.base ?? bracket.baseAmount);
      const rate = asNumber(bracket.rate);
      tax = baseAmount + (annualTaxable - min) * rate;
      break;
    }
  }
  const rebate = asNumber(value.rebate ?? value.primary_rebate);
  let medicalCredit = 0;
  if (monthlyMedical > 0 && value.medical_credit) {
    medicalCredit = asNumber(value.medical_credit) * periods;
  }
  const annualTax = Math.max(0, tax - rebate - medicalCredit);
  return annualTax / periods;
}

function annualiseFromPeriod(periodAmount, frequency) {
  const freq = String(frequency || "monthly").toLowerCase();
  if (freq === "weekly") return periodAmount * 52;
  if (freq === "bi_weekly") return periodAmount * 26;
  return periodAmount * 12;
}

function periodiseFromMonthly(monthly, frequency) {
  const freq = String(frequency || "monthly").toLowerCase();
  if (freq === "weekly") return monthly * (12 / 52);
  if (freq === "bi_weekly") return monthly * (12 / 26);
  return monthly;
}

function resolveBasicPay(profile, extras = {}) {
  const payType = String(profile?.pay_type || "monthly_salary");
  if (payType === "hourly") {
    const hours = asNumber(extras.hours ?? profile?.hours_in_period);
    return ROUND_MONEY(asNumber(profile?.hourly_rate) * hours);
  }
  if (payType === "daily") {
    const days = asNumber(extras.days ?? profile?.days_in_period);
    return ROUND_MONEY(asNumber(profile?.daily_rate) * days);
  }
  return ROUND_MONEY(asNumber(profile?.base_salary));
}

/**
 * Canonical payroll calculation. Pure: no I/O, no Date.now(), no browser timezone.
 *
 * @param {{
 *   profile: Record<string, unknown>,
 *   earnings?: Array<Record<string, unknown>>,
 *   deductions?: Array<Record<string, unknown>>,
 *   statutoryRules?: Array<Record<string, unknown>>,
 *   overtimeHours?: number,
 *   overtimeRate?: number,
 *   extras?: Record<string, unknown>,
 * }} input
 */
export function calculatePayroll({
  profile,
  earnings = [],
  deductions = [],
  statutoryRules = [],
  overtimeHours = 0,
  overtimeRate = 0,
  extras = {},
} = {}) {
  const warnings = [];
  const frequency = String(profile?.pay_frequency || "monthly");
  const basic = resolveBasicPay(profile, extras);
  const overtimePay = ROUND_MONEY(asNumber(overtimeHours) * asNumber(overtimeRate));

  const earningLines = [];
  if (basic > 0) {
    earningLines.push({
      code: "BASIC",
      name: "Basic salary",
      type: "basic",
      amount: basic,
      taxable: true,
      recurring: true,
    });
  }
  if (overtimePay > 0) {
    earningLines.push({
      code: "OT",
      name: "Overtime",
      type: "overtime",
      amount: overtimePay,
      taxable: true,
      recurring: false,
    });
  }
  for (const line of earnings) {
    const amount = lineAmount(line);
    if (amount === 0 && !line?.include_zero) continue;
    earningLines.push({
      code: String(line.code || line.name || "EARN").toUpperCase().slice(0, 32),
      name: String(line.name || line.code || "Earning"),
      type: String(line.type || "other"),
      amount,
      taxable: line.taxable !== false,
      recurring: Boolean(line.recurring),
    });
  }

  const gross = ROUND_MONEY(earningLines.reduce((sum, line) => sum + line.amount, 0));
  const taxableEarnings = ROUND_MONEY(
    earningLines.filter((line) => line.taxable).reduce((sum, line) => sum + line.amount, 0)
  );

  const otherDeductionLines = [];
  let pension = 0;
  let medical = 0;
  for (const line of deductions) {
    const amount = lineAmount(line);
    const code = String(line.code || line.name || "DED").toUpperCase();
    const type = String(line.type || "other").toLowerCase();
    if (type === "pension" || type === "retirement" || code === "PENSION") {
      pension += amount;
    } else if (type === "medical" || type === "medical_aid" || code === "MEDICAL") {
      medical += amount;
    }
    otherDeductionLines.push({
      code: code.slice(0, 32),
      name: String(line.name || line.code || "Deduction"),
      type,
      amount,
      employee_portion: line.employee_portion !== false,
      tax_treatment: String(line.tax_treatment || "standard"),
    });
  }

  const pensionAnnualCapRate = asNumber(extras.pension_annual_cap_rate);
  const annualGross = annualiseFromPeriod(gross, frequency);
  let pensionForTax = pension;
  if (pensionAnnualCapRate > 0) {
    const annualPension = annualiseFromPeriod(pension, frequency);
    const capped = Math.min(annualPension, annualGross * pensionAnnualCapRate);
    pensionForTax = periodiseFromMonthly(capped / 12, frequency);
  }
  const taxableIncome = ROUND_MONEY(Math.max(0, annualiseFromPeriod(taxableEarnings, frequency) - annualiseFromPeriod(pensionForTax, frequency)));

  const statutoryLines = [];
  if (!Array.isArray(statutoryRules) || statutoryRules.length === 0) {
    warnings.push("No statutory rules configured for this period. Statutory deductions were not applied.");
  }
  for (const rule of statutoryRules || []) {
    const applied = applyStatutoryRule(rule, {
      gross,
      basic,
      taxableIncome,
      pension: pensionForTax,
      medical,
    });
    if (applied.amount > 0 || applied.employer_amount > 0) {
      statutoryLines.push({
        ...applied,
        type: "statutory",
      });
    }
  }

  const statutoryEmployee = ROUND_MONEY(
    statutoryLines.filter((l) => l.employee_portion !== false).reduce((sum, l) => sum + asNumber(l.amount), 0)
  );
  const otherEmployee = ROUND_MONEY(
    otherDeductionLines.filter((l) => l.employee_portion !== false).reduce((sum, l) => sum + asNumber(l.amount), 0)
  );
  const totalDeductions = ROUND_MONEY(statutoryEmployee + otherEmployee);
  const netPay = ROUND_MONEY(gross - totalDeductions);

  if (netPay < 0) {
    warnings.push("Net pay is negative. Review earnings and deductions before approval.");
  }

  const paye = statutoryLines.find((l) => String(l.code).toUpperCase() === "PAYE");
  const uif = statutoryLines.find((l) => String(l.code).toUpperCase() === "UIF");

  return {
    basic,
    overtime_pay: overtimePay,
    earnings: earningLines,
    gross_pay: gross,
    taxable_income: taxableIncome,
    statutory_deductions: statutoryLines,
    other_deductions: otherDeductionLines,
    total_statutory: statutoryEmployee,
    total_other_deductions: otherEmployee,
    total_deductions: totalDeductions,
    net_pay: netPay,
    tax_deduction: ROUND_MONEY(paye?.amount || 0),
    uif_deduction: ROUND_MONEY(uif?.amount || 0),
    pension_deduction: ROUND_MONEY(pension),
    medical_aid_deduction: ROUND_MONEY(medical),
    warnings,
    breakdown: {
      basic,
      earnings: earningLines.filter((l) => l.code !== "BASIC"),
      gross: gross,
      statutory: statutoryLines,
      other: otherDeductionLines,
      total_deductions: totalDeductions,
      net: netPay,
    },
  };
}

/** Rules whose effective window covers `onIso` (YYYY-MM-DD). Org rules override platform (org_id null). */
export function selectStatutoryRules(rules, onIso) {
  const date = String(onIso || "").slice(0, 10);
  const eligible = (rules || []).filter((rule) => {
    const from = String(rule.effective_from || "").slice(0, 10);
    const to = rule.effective_to ? String(rule.effective_to).slice(0, 10) : null;
    if (from && date && date < from) return false;
    if (to && date && date > to) return false;
    return true;
  });
  const byCode = new Map();
  for (const rule of eligible) {
    const code = String(rule.code || "").toUpperCase();
    const existing = byCode.get(code);
    if (!existing) {
      byCode.set(code, rule);
      continue;
    }
    const existingOrg = existing.org_id != null && existing.org_id !== "";
    const nextOrg = rule.org_id != null && rule.org_id !== "";
    if (nextOrg && !existingOrg) {
      byCode.set(code, rule);
      continue;
    }
    if (nextOrg === existingOrg && String(rule.effective_from || "") > String(existing.effective_from || "")) {
      byCode.set(code, rule);
    }
  }
  return [...byCode.values()];
}
