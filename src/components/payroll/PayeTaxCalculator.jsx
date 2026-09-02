import { calculatePayroll } from "@shared/payroll/calculatePayroll.js";

/**
 * Browser payroll helpers. Statutory rates are NOT stored here.
 * Pass `statutoryRules` from the server, or use `/api/payroll/preview`.
 */
export function calculateFullPayroll(
  basicSalary,
  allowances = [],
  overtimeHours = 0,
  overtimeRate = 0,
  medicalAid = 0,
  pensionFund = 0,
  statutoryRules = []
) {
  const result = calculatePayroll({
    profile: { base_salary: basicSalary, pay_frequency: "monthly", pay_type: "monthly_salary" },
    earnings: (allowances || []).map((a) => ({
      name: a.name || "Allowance",
      amount: a.amount,
      type: "allowance",
      taxable: true,
    })),
    deductions: [
      Number(pensionFund) > 0 ? { code: "PENSION", name: "Pension fund", type: "pension", amount: pensionFund } : null,
      Number(medicalAid) > 0 ? { code: "MEDICAL", name: "Medical aid", type: "medical", amount: medicalAid } : null,
    ].filter(Boolean),
    statutoryRules,
    overtimeHours,
    overtimeRate,
  });
  return {
    grossPay: result.gross_pay,
    basicSalary: result.basic,
    overtimePay: result.overtime_pay,
    totalAllowances: result.earnings.filter((e) => e.type === "allowance").reduce((s, e) => s + e.amount, 0),
    payeDeduction: result.tax_deduction,
    uifDeduction: result.uif_deduction,
    medicalAidDeduction: result.medical_aid_deduction,
    pensionDeduction: result.pension_deduction,
    totalDeductions: result.total_deductions,
    netPay: result.net_pay,
    warnings: result.warnings,
    taxInfo: {
      annualSalary: Math.round((Number(basicSalary) || 0) * 12),
      taxableIncome: result.taxable_income,
      marginalTaxRate: "configured",
      taxCredits: 0,
    },
  };
}

/** @deprecated Use /api/payroll/preview — rates are not applied in the browser. */
export function calculatePAYE() {
  return {
    monthlyPAYE: 0,
    annualPAYE: 0,
    taxableIncome: 0,
    taxCredits: 0,
    pensionDeduction: 0,
    marginalTaxRate: 0,
  };
}

export function calculateUIF() {
  return 0;
}

export function calculateSDL() {
  return 0;
}
