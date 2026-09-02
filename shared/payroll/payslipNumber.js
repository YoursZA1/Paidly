/**
 * Employee-facing payslip numbers. Database ids are never shown as the payslip number.
 * Example: PS-2026-09-EMP001
 */

function digitsOnly(value) {
  return String(value || "").replace(/\D+/g, "");
}

function sanitizeEmployeeCode(raw) {
  const cleaned = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  if (cleaned) return cleaned.slice(0, 24);
  return "EMP";
}

/**
 * @param {{ periodStart: string, employeeNumber?: string, sequence?: number }} input
 */
export function buildPayslipNumber({ periodStart, employeeNumber, sequence } = {}) {
  const match = String(periodStart || "").match(/^(\d{4})-(\d{2})/);
  const year = match?.[1] || "0000";
  const month = match?.[2] || "00";
  let emp = sanitizeEmployeeCode(employeeNumber);
  if (emp === "EMP" && sequence != null) {
    emp = `EMP${String(sequence).padStart(3, "0")}`;
  }
  if (/^\d+$/.test(emp)) {
    emp = `EMP${emp.padStart(3, "0")}`;
  }
  return `PS-${year}-${month}-${emp}`;
}

export function buildEmployeeNumber(sequence) {
  const n = Math.max(1, Number(sequence) || 1);
  return `EMP-${String(n).padStart(3, "0")}`;
}

export function nextEmployeeSequence(existingNumbers = []) {
  let max = 0;
  for (const value of existingNumbers) {
    const digits = digitsOnly(String(value).replace(/^EMP-?/i, ""));
    const n = Number(digits);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
