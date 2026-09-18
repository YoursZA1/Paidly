/**
 * Employer chrome for payslips and payroll reports.
 * Live source: organizations (+ payroll_settings jsonb).
 * Issued payslips store employer_snapshot so history does not drift.
 */

function text(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function normalizeEmployerPayrollSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  return {
    paye_reference: text(raw.paye_reference) || "",
    uif_reference: text(raw.uif_reference) || "",
    sdl_reference: text(raw.sdl_reference) || "",
  };
}

/**
 * Merge patch into existing payroll_settings without wiping unrelated keys.
 * @param {Record<string, unknown>|null|undefined} existing
 * @param {Record<string, unknown>|null|undefined} patch
 */
export function mergeEmployerPayrollSettings(existing, patch) {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const next = normalizeEmployerPayrollSettings(patch);
  if (patch && Object.prototype.hasOwnProperty.call(patch, "paye_reference")) {
    base.paye_reference = next.paye_reference || null;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "uif_reference")) {
    base.uif_reference = next.uif_reference || null;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "sdl_reference")) {
    base.sdl_reference = next.sdl_reference || null;
  }
  return base;
}

/**
 * Build frozen employer snapshot from org row (+ optional profile fallbacks).
 * @param {Record<string, unknown>|null|undefined} org
 * @param {Record<string, unknown>|null|undefined} [profileFallback]
 */
export function buildEmployerSnapshot(org, profileFallback = null) {
  const settings = normalizeEmployerPayrollSettings(org?.payroll_settings);
  const name =
    text(org?.name) ||
    text(profileFallback?.company_name) ||
    null;
  const address =
    text(org?.address) ||
    text(profileFallback?.company_address) ||
    null;
  const email =
    text(org?.company_email) ||
    text(profileFallback?.email) ||
    null;
  const phone =
    text(org?.phone) ||
    text(profileFallback?.phone) ||
    null;

  return {
    company_name: name,
    registration_number: text(org?.registration_number),
    address,
    email,
    phone,
    paye_reference: settings.paye_reference || null,
    uif_reference: settings.uif_reference || null,
    sdl_reference: settings.sdl_reference || null,
  };
}

/**
 * Prefer issued snapshot over live user/org fields for display.
 * @param {Record<string, unknown>|null|undefined} payslip
 * @param {Record<string, unknown>|null|undefined} [user]
 */
export function resolvePayslipEmployerDisplay(payslip, user = null) {
  const snap = payslip?.employer_snapshot && typeof payslip.employer_snapshot === "object"
    ? payslip.employer_snapshot
    : null;
  return {
    company_name:
      text(snap?.company_name) ||
      text(user?.company_name) ||
      text(payslip?.owner_company_name) ||
      null,
    address:
      text(snap?.address) ||
      text(user?.company_address) ||
      text(payslip?.owner_company_address) ||
      null,
    logo_url:
      text(user?.logo_url) ||
      text(user?.company_logo_url) ||
      text(payslip?.owner_logo_url) ||
      null,
    registration_number: text(snap?.registration_number),
    email: text(snap?.email) || text(user?.email) || null,
    phone: text(snap?.phone) || text(user?.phone) || null,
    paye_reference: text(snap?.paye_reference),
    uif_reference: text(snap?.uif_reference),
    sdl_reference: text(snap?.sdl_reference),
  };
}
