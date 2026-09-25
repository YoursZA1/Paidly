import { ROUND_MONEY } from "./constants.js";
import { unpaidLeaveAmount } from "./unpaidLeaveImpact.js";
import { ageAtTaxYearEnd, periodsPerTaxYear, taxYearForDate } from "./taxYear.js";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function lineAmount(line) {
  return ROUND_MONEY(asNumber(line?.amount));
}

/** Earning types SARS treats as irregular (taxed on the annual-equivalent difference, not ×12). */
const IRREGULAR_EARNING_TYPES = new Set([
  "bonus",
  "annual_bonus",
  "thirteenth_cheque",
  "13th_cheque",
  "leave_payout",
  "leave_pay_out",
  "once_off",
  "irregular",
]);

export function isIrregularEarning(line) {
  if (line?.irregular === true) return true;
  if (line?.irregular === false) return false;
  return (
    IRREGULAR_EARNING_TYPES.has(String(line?.type || "").toLowerCase()) ||
    IRREGULAR_EARNING_TYPES.has(String(line?.code || "").toLowerCase())
  );
}

/** Non-cash taxable benefits (company car, low-interest loan…): taxed, never paid out. */
/**
 * Lines the engine writes itself (basic pay, unpaid leave, overtime). A stored item's earnings are
 * fed back on recalculation; these must not be counted a second time.
 */
export function isEngineGeneratedEarning(line) {
  const code = String(line?.code || "").toUpperCase();
  const type = String(line?.type || "").toLowerCase();
  return type === "basic" || type === "unpaid_leave" || code === "BASIC" || code === "UNPAID" || (code === "OT" && type === "overtime");
}

/** Input earnings of a stored pay run item: everything except the engine's own lines. */
export function inputEarningLines(lines) {
  return (Array.isArray(lines) ? lines : []).filter((l) => !isEngineGeneratedEarning(l));
}

export function isFringeBenefit(line) {
  return line?.cash === false || String(line?.type || "").toLowerCase() === "fringe_benefit";
}

function taxablePortion(line) {
  if (line?.taxable === false) return 0;
  if (line?.taxable_portion == null || line.taxable_portion === "") return 1;
  return Math.min(1, Math.max(0, asNumber(line.taxable_portion)));
}

// ── Tax tables ───────────────────────────────────────────────────────────────

/**
 * Normalise a bracket table to SARS form: tax = base + rate × (income − threshold).
 * Accepts { above | threshold, rate, base } or the legacy { min, max, rate, base } where min is the
 * first rand of the bracket (e.g. 237 101): its threshold is the previous bracket's max, so the
 * 1-rand gaps between brackets (and cents inside them) are covered.
 */
export function normalizeTaxBrackets(brackets = []) {
  const rows = (Array.isArray(brackets) ? brackets : []).map((b) => ({ ...b }));
  rows.sort((a, b) => asNumber(a.above ?? a.threshold ?? a.min) - asNumber(b.above ?? b.threshold ?? b.min));
  let previousMax = 0;
  return rows.map((b, i) => {
    let threshold;
    if (b.above != null || b.threshold != null) threshold = asNumber(b.above ?? b.threshold);
    else if (i === 0) threshold = Math.max(0, asNumber(b.min) <= 1 ? 0 : asNumber(b.min) - 1);
    else threshold = previousMax;
    if (b.max != null && b.max !== "") previousMax = asNumber(b.max);
    return { threshold, rate: asNumber(b.rate), base: asNumber(b.base ?? b.baseAmount) };
  });
}

/** Annual tax on annual taxable income before rebates, and the bracket used. */
export function bracketTax(annualIncome, brackets) {
  const income = asNumber(annualIncome);
  const table = normalizeTaxBrackets(brackets);
  if (income <= 0 || table.length === 0) return { tax: 0, bracket: null };
  let bracket = table[0];
  for (const row of table) {
    if (income > row.threshold) bracket = row;
  }
  return { tax: bracket.base + (income - bracket.threshold) * bracket.rate, bracket };
}

/** Annual rebates for an age (age on the last day of the tax year). Legacy `rebate` = primary. */
export function annualRebates(value, age) {
  const r = value?.rebates && typeof value.rebates === "object" ? value.rebates : {};
  const primary = asNumber(r.primary ?? value?.rebate ?? value?.primary_rebate);
  const secondary = age != null && age >= 65 ? asNumber(r.secondary) : 0;
  const tertiary = age != null && age >= 75 ? asNumber(r.tertiary) : 0;
  return { primary, secondary, tertiary, total: primary + secondary + tertiary };
}

/**
 * Annual medical scheme fees tax credit (s6A). `members` = people on the scheme the employee pays
 * for, including the employee. Monthly credits come from the rule; legacy `medical_credit` is annual.
 */
export function annualMedicalCredit(value, members, monthlyMedicalContribution = 0) {
  const count = Math.max(0, Math.floor(asNumber(members)));
  const mc = value?.medical_credits && typeof value.medical_credits === "object" ? value.medical_credits : null;
  if (mc) {
    if (count <= 0) return 0;
    const monthly =
      asNumber(mc.main) + (count >= 2 ? asNumber(mc.first_dependant) : 0) + Math.max(0, count - 2) * asNumber(mc.additional);
    return monthly * 12;
  }
  if (value?.medical_credit && asNumber(monthlyMedicalContribution) > 0) return asNumber(value.medical_credit);
  return 0;
}

/**
 * SARS employees' tax for one period (Fourth Schedule, annual-equivalent method).
 *
 * Regular remuneration is annualised; irregular remuneration (bonus, once-off payments) is taxed as
 * tax(annual equivalent + irregular YTD) − tax(annual equivalent + irregular before this period),
 * so a bonus is never multiplied by 12.
 *
 * method:
 *  - "annualised" (default): annual equivalent = this period's regular remuneration × periods.
 *  - "run_to_date": annual equivalent = regular YTD × periods / periods worked, and this period's
 *    PAYE = regular tax due to date − regular PAYE already deducted (corrects earlier over/under
 *    deduction; never negative — the difference is reported as a warning).
 *
 * @param {{
 *   value: Record<string, any>,
 *   periodsPerYear: number,
 *   age: number | null,
 *   regularTaxable: number,     // this period, after the deductible retirement contribution
 *   irregularTaxable: number,   // this period
 *   medicalMembers?: number,
 *   monthlyMedical?: number,
 *   method?: string,
 *   ytd?: { periods?: number, regular_taxable?: number, irregular_taxable?: number, paye_regular?: number },
 * }} input
 */
export function computePaye({
  value,
  periodsPerYear,
  age,
  regularTaxable,
  irregularTaxable,
  medicalMembers = 0,
  monthlyMedical = 0,
  method = "annualised",
  ytd = {},
}) {
  const P = Math.max(1, asNumber(periodsPerYear) || 12);
  const brackets = value?.brackets || [];
  const rebates = annualRebates(value, age);
  const medicalCredit = annualMedicalCredit(value, medicalMembers, monthlyMedical);
  const annualTax = (income) => Math.max(0, bracketTax(income, brackets).tax - rebates.total - medicalCredit);

  const runToDate = String(method || "").toLowerCase() === "run_to_date";
  const priorPeriods = Math.max(0, Math.floor(asNumber(ytd.periods)));
  const n = runToDate ? priorPeriods + 1 : 1;
  const regularBase = runToDate ? asNumber(ytd.regular_taxable) + asNumber(regularTaxable) : asNumber(regularTaxable);
  const annualEquivalent = Math.max(0, (regularBase * P) / n);

  const regularAnnualTax = annualTax(annualEquivalent);
  const regularPeriod = runToDate
    ? (regularAnnualTax * n) / P - asNumber(ytd.paye_regular)
    : regularAnnualTax / P;

  const irregularBefore = asNumber(ytd.irregular_taxable);
  const irregularNow = asNumber(irregularTaxable);
  const irregularTax =
    irregularNow > 0 ? annualTax(annualEquivalent + irregularBefore + irregularNow) - annualTax(annualEquivalent + irregularBefore) : 0;

  const raw = regularPeriod + irregularTax;
  const amount = ROUND_MONEY(Math.max(0, raw));
  const { tax: taxBeforeRebates, bracket } = bracketTax(annualEquivalent, brackets);
  return {
    amount,
    regular_amount: ROUND_MONEY(Math.max(0, regularPeriod)),
    irregular_amount: ROUND_MONEY(Math.max(0, irregularTax)),
    negative_adjustment: raw < 0 ? ROUND_MONEY(raw) : 0,
    explanation: {
      method: runToDate ? "run_to_date" : "annualised",
      periods_per_year: P,
      periods_used: n,
      annual_equivalent: ROUND_MONEY(annualEquivalent),
      bracket: bracket ? { threshold: bracket.threshold, rate: bracket.rate, base: bracket.base } : null,
      tax_before_rebates: ROUND_MONEY(taxBeforeRebates),
      age,
      rebates: {
        primary: rebates.primary,
        secondary: rebates.secondary,
        tertiary: rebates.tertiary,
        total: rebates.total,
      },
      medical_credit_annual: ROUND_MONEY(medicalCredit),
      annual_tax: ROUND_MONEY(regularAnnualTax),
      regular_period_tax: ROUND_MONEY(regularPeriod),
      irregular_taxable: ROUND_MONEY(irregularNow),
      irregular_tax: ROUND_MONEY(irregularTax),
      prior_regular_paye: runToDate ? ROUND_MONEY(asNumber(ytd.paye_regular)) : null,
      paye: amount,
    },
  };
}

// ── Statutory rules ──────────────────────────────────────────────────────────

/**
 * Apply a versioned statutory rule. Rates live in the rule payload, never in this module.
 *
 * calculation_type:
 * - percent: value.rate * base
 * - capped_percent: min(rate * base, cap); value.ceiling_monthly caps the remuneration (UIF), scaled
 *   to the pay frequency
 * - fixed: value.amount
 * - tax_brackets: SARS employees' tax (see computePaye)
 *
 * @param {{ calculation_type: string, value: Record<string, unknown>, code?: string, name?: string, employee_portion?: boolean }} rule
 * @param {{ gross: number, basic: number, taxableIncome: number, pension: number, medical: number,
 *   periodsPerYear?: number, sdlExempt?: boolean, paye?: ReturnType<typeof computePaye> | null }} bases
 */
export function applyStatutoryRule(rule, bases) {
  const type = String(rule?.calculation_type || "").toLowerCase();
  const value = rule?.value && typeof rule.value === "object" ? rule.value : {};
  const employeePortion = rule?.employee_portion !== false;
  const base = type === "tax_brackets" ? null : ruleBase(value, bases);
  // Period remuneration the rule was applied to (e.g. UIF base) — kept for compliance reports.
  // Bracket tax works on annualised income, so no period base is recorded for it.
  const baseAmount = base == null ? null : ROUND_MONEY(base);
  const exempt = Boolean(value.employer_exemption_key) && Boolean(bases?.[exemptionFlag(value.employer_exemption_key)]);
  const computed = exempt ? 0 : computeRuleAmount(type, value, bases, base);
  const common = {
    code: String(rule?.code || "STAT"),
    name: String(rule?.name || rule?.code || "Statutory"),
    base_amount: baseAmount,
    rate: value.rate != null ? asNumber(value.rate) : null,
    rule_id: rule?.id || null,
    effective_from: rule?.effective_from || null,
    ...(exempt ? { exempt: true } : {}),
  };
  if (!employeePortion) {
    return { ...common, amount: 0, employer_amount: ROUND_MONEY(computed), employee_portion: false };
  }
  return { ...common, amount: ROUND_MONEY(computed), employer_amount: 0, employee_portion: true };
}

function exemptionFlag(key) {
  return String(key) === "sdl_exempt" ? "sdlExempt" : String(key);
}

function ruleBase(value, bases) {
  const baseKey = String(value.base || "gross").toLowerCase();
  let base;
  if (baseKey === "taxable") base = asNumber(bases.taxableIncome);
  else if (baseKey === "basic") base = asNumber(bases.basic);
  else if (baseKey === "uif") base = asNumber(bases.uifRemuneration ?? bases.gross);
  else if (baseKey === "leviable") base = asNumber(bases.leviable ?? bases.gross);
  else base = asNumber(bases.gross);
  if (value.ceiling_monthly != null && value.ceiling_monthly !== "") {
    const P = Math.max(1, asNumber(bases.periodsPerYear) || 12);
    base = Math.min(base, (asNumber(value.ceiling_monthly) * 12) / P);
  }
  return Math.max(0, base);
}

function computeRuleAmount(type, value, bases, base) {
  if (type === "fixed") return asNumber(value.amount);
  if (type === "percent") return base * asNumber(value.rate);
  if (type === "capped_percent") {
    const raw = base * asNumber(value.rate);
    const cap = value.cap == null ? Infinity : asNumber(value.cap);
    return Math.min(raw, cap);
  }
  if (type === "tax_brackets") {
    if (bases.paye) return bases.paye.amount;
    // Standalone use (no engine context): annualised taxable income, legacy semantics.
    const P = Math.max(1, asNumber(value.periods_per_year) || 12);
    return computePaye({
      value,
      periodsPerYear: P,
      age: null,
      regularTaxable: asNumber(bases.taxableIncome) / P,
      irregularTaxable: 0,
      monthlyMedical: asNumber(bases.medical),
    }).amount;
  }
  return 0;
}

// ── Pay ──────────────────────────────────────────────────────────────────────

function resolveBasicPay(profile, extras = {}, warnings = []) {
  const payType = String(profile?.pay_type || "monthly_salary");
  if (payType === "hourly") {
    const hours = asNumber(extras.hours ?? profile?.hours_in_period);
    if (hours <= 0) warnings.push("Hourly employee: no ordinary hours captured for this period, so basic pay is R0.");
    return { basic: ROUND_MONEY(asNumber(profile?.hourly_rate) * hours), units: hours, unit: "hours", rate: asNumber(profile?.hourly_rate) };
  }
  if (payType === "daily") {
    // Days worked if captured; otherwise the period's working days less approved unpaid leave.
    const captured = extras.days ?? profile?.days_in_period;
    const days =
      captured != null && captured !== ""
        ? asNumber(captured)
        : Math.max(0, asNumber(extras.working_days_in_period) - asNumber(extras.unpaid_leave_days));
    if (days <= 0) warnings.push("Daily employee: no days worked for this period, so basic pay is R0.");
    return { basic: ROUND_MONEY(asNumber(profile?.daily_rate) * days), units: days, unit: "days", rate: asNumber(profile?.daily_rate) };
  }
  return { basic: ROUND_MONEY(asNumber(profile?.base_salary)), units: null, unit: null, rate: null };
}

function annualiseFromPeriod(periodAmount, frequency) {
  return periodAmount * periodsPerTaxYear(frequency);
}

/**
 * Canonical payroll calculation. Pure: no I/O, no Date.now(), no browser timezone.
 * Everything that influenced the result is returned in `breakdown.inputs` so a finalized pay run
 * item never needs the (later-changed) employee profile again.
 *
 * @param {{
 *   profile: Record<string, unknown>,
 *   earnings?: Array<Record<string, unknown>>,
 *   deductions?: Array<Record<string, unknown>>,
 *   statutoryRules?: Array<Record<string, unknown>>,
 *   overtimeHours?: number,
 *   overtimeRate?: number,
 *   extras?: Record<string, unknown>,
 *   context?: {
 *     payDate?: string | null, periodStart?: string | null, periodEnd?: string | null,
 *     dateOfBirth?: string | null, medicalSchemeMembers?: number | null,
 *     payeMethod?: string | null, employer?: { sdl_exempt?: boolean } | null,
 *     ytd?: { periods?: number, regular_taxable?: number, irregular_taxable?: number, paye_regular?: number } | null,
 *   },
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
  context = {},
} = {}) {
  const warnings = [];
  const frequency = String(profile?.pay_frequency || "monthly");
  const payType = String(profile?.pay_type || "monthly_salary");
  const P = periodsPerTaxYear(frequency);
  const taxDate = String(context?.payDate || context?.periodEnd || "").slice(0, 10) || null;
  let taxYear = null;
  try {
    taxYear = taxDate ? taxYearForDate(taxDate) : null;
  } catch {
    taxYear = null;
  }

  const unpaidDays = asNumber(extras.unpaid_leave_days);
  const workingDaysInPeriod = asNumber(extras.working_days_in_period);
  const pay = resolveBasicPay(profile, extras, warnings);
  const basic = pay.basic;
  const overtimePay = ROUND_MONEY(asNumber(overtimeHours) * asNumber(overtimeRate));
  // Unpaid leave reduces salaried pay only; daily/hourly pay is already for units worked.
  const unpaidAmount =
    payType === "monthly_salary" || payType === "other"
      ? unpaidLeaveAmount({ basicPay: basic, unpaidDays, workingDaysInPeriod })
      : 0;

  const earningLines = [];
  if (basic > 0) {
    earningLines.push({ code: "BASIC", name: "Basic salary", type: "basic", amount: basic, taxable: true, recurring: true });
  }
  if (unpaidAmount > 0) {
    earningLines.push({
      code: "UNPAID",
      name: "Unpaid leave",
      type: "unpaid_leave",
      amount: ROUND_MONEY(-unpaidAmount),
      taxable: true,
      recurring: false,
    });
  }
  if (overtimePay > 0) {
    earningLines.push({ code: "OT", name: "Overtime", type: "overtime", amount: overtimePay, taxable: true, recurring: false });
  }
  for (const line of earnings) {
    if (isEngineGeneratedEarning(line)) continue;
    const amount = lineAmount(line);
    if (amount === 0 && !line?.include_zero) continue;
    earningLines.push({
      code: String(line.code || line.name || "EARN").toUpperCase().slice(0, 32),
      name: String(line.name || line.code || "Earning"),
      type: String(line.type || "other"),
      amount,
      taxable: line.taxable !== false,
      ...(line.taxable_portion != null ? { taxable_portion: taxablePortion(line) } : {}),
      recurring: Boolean(line.recurring),
      irregular: isIrregularEarning(line),
      ...(isFringeBenefit(line) ? { cash: false } : {}),
      ...(line.uif === false ? { uif: false } : {}),
    });
  }

  const cashLines = earningLines.filter((l) => !isFringeBenefit(l));
  const fringeLines = earningLines.filter((l) => isFringeBenefit(l));
  const gross = ROUND_MONEY(cashLines.reduce((sum, l) => sum + l.amount, 0));
  const fringeTotal = ROUND_MONEY(fringeLines.reduce((sum, l) => sum + l.amount, 0));
  const taxableOf = (l) => l.amount * taxablePortion(l);
  const irregularTaxable = ROUND_MONEY(earningLines.filter((l) => l.irregular).reduce((s, l) => s + taxableOf(l), 0));
  const taxableEarnings = ROUND_MONEY(earningLines.reduce((s, l) => s + taxableOf(l), 0));
  const regularTaxableBeforeRetirement = ROUND_MONEY(taxableEarnings - irregularTaxable);
  const uifRemuneration = ROUND_MONEY(cashLines.filter((l) => l.uif !== false).reduce((s, l) => s + l.amount, 0));

  const otherDeductionLines = [];
  let pension = 0;
  let medical = 0;
  let employerBenefits = 0;
  for (const line of deductions) {
    const amount = lineAmount(line);
    const code = String(line.code || line.name || "DED").toUpperCase();
    const type = String(line.type || "other").toLowerCase();
    if (type === "pension" || type === "provident" || type === "retirement" || type === "retirement_annuity" || code === "PENSION") {
      pension += amount;
    } else if (type === "medical" || type === "medical_aid" || code === "MEDICAL") {
      medical += amount;
    }
    const employerAmount = ROUND_MONEY(asNumber(line.employer_amount));
    employerBenefits += employerAmount;
    otherDeductionLines.push({
      code: code.slice(0, 32),
      name: String(line.name || line.code || "Deduction"),
      type,
      amount,
      employee_portion: line.employee_portion !== false,
      tax_treatment: String(line.tax_treatment || "standard"),
      ...(employerAmount ? { employer_amount: employerAmount } : {}),
    });
  }

  const payeRule = (statutoryRules || []).find((r) => String(r.code || "").toUpperCase() === "PAYE");
  const payeValue = payeRule?.value && typeof payeRule.value === "object" ? payeRule.value : {};

  // Retirement fund contributions are deductible up to the rule's % of remuneration and annual cap.
  const retirement = payeValue.retirement && typeof payeValue.retirement === "object" ? payeValue.retirement : null;
  const capRate = retirement ? asNumber(retirement.rate_cap) : asNumber(extras.pension_annual_cap_rate);
  const annualCap = retirement && retirement.annual_cap != null ? asNumber(retirement.annual_cap) : Infinity;
  const annualPension = annualiseFromPeriod(pension, frequency);
  const annualRemuneration = annualiseFromPeriod(regularTaxableBeforeRetirement, frequency) + irregularTaxable;
  const deductibleAnnual = capRate > 0 ? Math.min(annualPension, annualRemuneration * capRate, annualCap) : annualPension;
  const pensionForTax = ROUND_MONEY(deductibleAnnual / P);
  const regularTaxable = ROUND_MONEY(Math.max(0, regularTaxableBeforeRetirement - pensionForTax));
  const taxableIncome = ROUND_MONEY(annualiseFromPeriod(regularTaxable, frequency) + irregularTaxable);

  const dob = context?.dateOfBirth || null;
  const age = dob && taxYear ? ageAtTaxYearEnd(dob, taxYear) : null;
  let paye = null;
  if (!payeRule && Array.isArray(statutoryRules) && statutoryRules.length > 0) {
    warnings.push(
      `No PAYE tax table covers ${taxYear ? `the ${taxYear.label} tax year` : "this payment date"}: PAYE was not deducted. Add the SARS table before approving.`
    );
  }
  if (payeRule) {
    if (taxYear && payeValue.tax_year != null && Number(payeValue.tax_year) !== taxYear.code) {
      warnings.push(
        `PAYE rule "${payeRule.name || "PAYE"}" is for the ${payeValue.tax_year} tax year, but this payment falls in ${taxYear.label}. Update the statutory rule.`
      );
    } else if (taxYear && payeValue.tax_year == null) {
      warnings.push(`PAYE rule "${payeRule.name || "PAYE"}" does not state its tax year. Confirm it holds ${taxYear.label} SARS tables.`);
    }
    if (!dob && (payeValue.rebates?.secondary || payeValue.rebates?.tertiary)) {
      warnings.push("Date of birth not captured: only the primary rebate was applied (no age 65+/75+ rebates).");
    }
    if (medical > 0 && context?.medicalSchemeMembers == null && payeValue.medical_credits) {
      warnings.push("Medical aid deducted but scheme members not captured on the payroll profile: no medical tax credit applied.");
    }
    paye = computePaye({
      value: payeValue,
      periodsPerYear: P,
      age,
      regularTaxable,
      irregularTaxable,
      medicalMembers: asNumber(context?.medicalSchemeMembers),
      monthlyMedical: medical,
      method: context?.payeMethod || payeValue.method || "annualised",
      ytd: context?.ytd || {},
    });
    if (paye.negative_adjustment < 0) {
      warnings.push(
        `Run-to-date PAYE: R${Math.abs(paye.negative_adjustment).toFixed(2)} was over-deducted earlier this tax year. PAYE is R0 this period; the balance is corrected on the IRP5 / next periods.`
      );
    }
  }

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
      periodsPerYear: P,
      uifRemuneration,
      leviable: ROUND_MONEY(gross + fringeTotal),
      sdlExempt: Boolean(context?.employer?.sdl_exempt),
      paye,
    });
    if (applied.amount > 0 || applied.employer_amount > 0 || applied.exempt) {
      statutoryLines.push({ ...applied, type: "statutory" });
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
  if (netPay < 0) warnings.push("Net pay is negative. Review earnings and deductions before approval.");

  const payeLine = statutoryLines.find((l) => String(l.code).toUpperCase() === "PAYE");
  const uifLine = statutoryLines.find((l) => String(l.code).toUpperCase() === "UIF");
  const employerUif = ROUND_MONEY(
    statutoryLines.filter((l) => /^UIF/i.test(l.code) && l.employee_portion === false).reduce((s, l) => s + l.employer_amount, 0)
  );
  const sdl = ROUND_MONEY(statutoryLines.filter((l) => String(l.code).toUpperCase() === "SDL").reduce((s, l) => s + l.employer_amount, 0));
  const employerStatutory = ROUND_MONEY(statutoryLines.reduce((s, l) => s + asNumber(l.employer_amount), 0));
  const employerContributions = {
    uif: employerUif,
    sdl,
    other_statutory: ROUND_MONEY(employerStatutory - employerUif - sdl),
    benefits: ROUND_MONEY(employerBenefits),
    total: ROUND_MONEY(employerStatutory + employerBenefits),
  };
  const employerCost = ROUND_MONEY(gross + employerContributions.total);

  const ruleVersions = (statutoryRules || []).map((r) => ({
    code: String(r.code || "").toUpperCase(),
    id: r.id || null,
    org_id: r.org_id || null,
    effective_from: r.effective_from || null,
    effective_to: r.effective_to || null,
    tax_year: r.value?.tax_year ?? null,
  }));

  const periodTaxable = ROUND_MONEY(regularTaxable + irregularTaxable);
  return {
    basic,
    overtime_pay: overtimePay,
    earnings: earningLines,
    gross_pay: gross,
    fringe_benefits: fringeTotal,
    // Annual taxable income used for tax (regular annualised + irregular) — historical column meaning.
    taxable_income: taxableIncome,
    period_taxable: periodTaxable,
    regular_taxable: regularTaxable,
    irregular_taxable: irregularTaxable,
    statutory_deductions: statutoryLines,
    other_deductions: otherDeductionLines,
    total_statutory: statutoryEmployee,
    total_other_deductions: otherEmployee,
    total_deductions: totalDeductions,
    net_pay: netPay,
    tax_deduction: ROUND_MONEY(payeLine?.amount || 0),
    uif_deduction: ROUND_MONEY(uifLine?.amount || 0),
    pension_deduction: ROUND_MONEY(pension),
    medical_aid_deduction: ROUND_MONEY(medical),
    unpaid_leave_days: unpaidDays,
    unpaid_leave_amount: unpaidAmount,
    employer_contributions: employerContributions,
    employer_cost: employerCost,
    tax_year: taxYear ? taxYear.label : null,
    warnings,
    breakdown: {
      basic,
      earnings: earningLines.filter((l) => l.code !== "BASIC"),
      gross: gross,
      statutory: statutoryLines,
      other: otherDeductionLines,
      total_deductions: totalDeductions,
      net: netPay,
      unpaid_leave_days: unpaidDays,
      unpaid_leave_amount: unpaidAmount,
      base_salary_snapshot: asNumber(profile?.base_salary),
      tax_year: taxYear ? { code: taxYear.code, label: taxYear.label, start: taxYear.start, end: taxYear.end } : null,
      period_taxable: periodTaxable,
      regular_taxable: regularTaxable,
      irregular_taxable: irregularTaxable,
      retirement_deductible: pensionForTax,
      uif_remuneration: uifRemuneration,
      paye: paye ? { ...paye.explanation, regular_amount: paye.regular_amount, irregular_amount: paye.irregular_amount } : null,
      employer_contributions: employerContributions,
      employer_cost: employerCost,
      // Frozen calculation inputs — history must not follow later profile changes.
      inputs: {
        pay_type: payType,
        pay_frequency: frequency,
        base_salary: asNumber(profile?.base_salary),
        hourly_rate: asNumber(profile?.hourly_rate),
        daily_rate: asNumber(profile?.daily_rate),
        units: pay.units,
        unit: pay.unit,
        unit_rate: pay.rate,
        working_days: workingDaysInPeriod,
        unpaid_leave_days: unpaidDays,
        overtime_hours: asNumber(overtimeHours),
        overtime_rate: asNumber(overtimeRate),
        pay_date: context?.payDate || null,
        period_start: context?.periodStart || null,
        period_end: context?.periodEnd || null,
        date_of_birth_on_file: Boolean(dob),
        age_at_tax_year_end: age,
        medical_scheme_members: context?.medicalSchemeMembers ?? null,
        paye_method: paye?.explanation?.method || null,
        sdl_exempt: Boolean(context?.employer?.sdl_exempt),
        ytd_used: context?.ytd || null,
        statutory_rule_versions: ruleVersions,
      },
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
