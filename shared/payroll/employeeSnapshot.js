/**
 * Employee payroll identity frozen onto issued payslips.
 * Live source: memberships (HR) mirrored to payroll_profiles (+ tax_identifiers, banking).
 * Sensitive numbers are masked — the payslip never stores a full ID or account number.
 */

function text(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

/**
 * Keep the last `visible` characters, mask the rest.
 * @param {unknown} value
 * @param {number} [visible]
 */
export function maskIdentifier(value, visible = 4) {
  const s = text(value);
  if (!s) return null;
  const compact = s.replace(/\s+/g, "");
  if (compact.length <= visible) return compact;
  return `${"•".repeat(Math.min(6, compact.length - visible))}${compact.slice(-visible)}`;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const v = text(obj[key]);
    if (v) return v;
  }
  return null;
}

/**
 * @param {Record<string, unknown>|null|undefined} profile payroll_profiles row
 */
export function buildEmployeePayslipSnapshot(profile) {
  const tax = profile?.tax_identifiers && typeof profile.tax_identifiers === "object" ? profile.tax_identifiers : {};
  const bank = profile?.banking && typeof profile.banking === "object" ? profile.banking : {};
  const idNumber = pick(tax, ["id_number", "national_id", "identity_number"]);
  const passport = pick(tax, ["passport_number", "passport"]);
  return {
    employee_number: text(profile?.employee_number),
    full_name: text(profile?.full_name),
    email: text(profile?.email),
    job_title: text(profile?.job_title),
    department: text(profile?.department),
    employment_start_date: text(profile?.employment_start_date),
    pay_frequency: text(profile?.pay_frequency),
    tax_number: pick(tax, ["tax_number", "income_tax_number", "tax_reference"]),
    id_number_masked: maskIdentifier(idNumber),
    passport_number_masked: idNumber ? null : maskIdentifier(passport),
    uif_number: pick(tax, ["uif_number", "uif_reference"]),
    bank_name: pick(bank, ["bank_name", "bank"]),
    bank_account_masked: maskIdentifier(pick(bank, ["account_number", "account_no"])),
    bank_account_type: pick(bank, ["account_type"]),
  };
}
