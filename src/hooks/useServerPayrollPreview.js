import { useEffect, useState } from "react";
import { payrollApi } from "@/services/PayrollApiService";
import { calculateFullPayroll } from "@/components/payroll/PayeTaxCalculator";

/**
 * Server-canonical payroll preview with a local gross fallback if the API is unavailable.
 */
export function useServerPayrollPreview({
  basicSalary,
  allowances,
  overtimeHours,
  overtimeRate,
  medicalAid,
  pensionFund,
  otherDeductions,
  periodEnd,
}) {
  const [server, setServer] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const basic = parseFloat(basicSalary) || 0;
    const otH = parseFloat(overtimeHours) || 0;
    const otR = parseFloat(overtimeRate) || 0;
    const parsedAllowances = (allowances || []).map((a) => ({ ...a, amount: parseFloat(a.amount) || 0 }));
    if (basic <= 0 && otH <= 0 && parsedAllowances.length === 0) {
      setServer(null);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const result = await payrollApi.preview({
          profile: { base_salary: basic, pay_frequency: "monthly", pay_type: "monthly_salary" },
          earnings: parsedAllowances.map((a) => ({
            name: a.name || "Allowance",
            amount: a.amount,
            type: "allowance",
            taxable: true,
          })),
          deductions: [
            Number(pensionFund) > 0
              ? { code: "PENSION", name: "Pension fund", type: "pension", amount: Number(pensionFund) }
              : null,
            Number(medicalAid) > 0
              ? { code: "MEDICAL", name: "Medical aid", type: "medical", amount: Number(medicalAid) }
              : null,
            ...(otherDeductions || []).map((d) => ({
              name: d.name || "Deduction",
              amount: Number(d.amount) || 0,
              type: "other",
            })),
          ].filter(Boolean),
          overtime_hours: otH,
          overtime_rate: otR,
          period_end: periodEnd,
        });
        if (cancelled) return;
        setError("");
        setServer({
          grossPay: result.gross_pay,
          totalDeductions: result.total_deductions,
          netPay: result.net_pay,
          payeDeduction: result.tax_deduction,
          uifDeduction: result.uif_deduction,
          taxInfo: {
            annualSalary: Math.round(basic * 12),
            taxableIncome: result.taxable_income,
            marginalTaxRate: "server",
            taxCredits: 0,
          },
          warnings: result.warnings,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Preview unavailable");
        setServer(
          calculateFullPayroll(basic, parsedAllowances, otH, otR, Number(medicalAid) || 0, Number(pensionFund) || 0, [])
        );
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [basicSalary, allowances, overtimeHours, overtimeRate, medicalAid, pensionFund, otherDeductions, periodEnd]);

  return { calculatedPayroll: server, previewError: error };
}
