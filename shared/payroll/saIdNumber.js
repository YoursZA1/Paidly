// @ts-check
/**
 * South African ID numbers (13 digits: YYMMDD SSSS C A Z, Luhn check digit).
 * Used as the opening password of payslip PDFs — see server/src/payroll/payslipPdfSecurity.js.
 * Never log, persist or return a normalised ID from these helpers' callers.
 */

/** Digits only ("850101 5800 088" → "8501015800088"). */
export function normalizeSaIdNumber(raw) {
  return String(raw ?? "").replace(/\D/g, "");
}

function luhnValid(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * A structurally valid SA ID: 13 digits, a real birth date (YYMMDD), citizenship digit 0/1/2, and
 * a correct Luhn check digit. Formatting characters are ignored.
 */
export function isValidSaIdNumber(raw) {
  const id = normalizeSaIdNumber(raw);
  if (!/^\d{13}$/.test(id)) return false;
  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  // Leap-year agnostic: 29 Feb is accepted for any YY (century is not encoded).
  const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mm - 1];
  if (dd > maxDay) return false;
  if (!["0", "1", "2"].includes(id[10])) return false;
  return luhnValid(id);
}

/** The ID number field of a payroll profile's tax_identifiers (same keys the payslip snapshot reads). */
export function employeeIdNumberOf(profile) {
  const tax = profile?.tax_identifiers && typeof profile.tax_identifiers === "object" ? profile.tax_identifiers : {};
  for (const key of ["id_number", "national_id", "identity_number"]) {
    const v = String(tax[key] ?? "").trim();
    if (v) return v;
  }
  return "";
}
