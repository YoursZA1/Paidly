/**
 * Employer chrome for payslips and payroll reports.
 * Live source: organizations (+ payroll_settings jsonb).
 * Issued payslips store employer_snapshot so history does not drift.
 */

function text(value) {
  const s = String(value ?? "").trim();
  return s || null;
}

/** Default HR reminder lead time for birthdays / work anniversaries (days). */
export const DEFAULT_PEOPLE_REMINDER_LEAD_DAYS = 30;

/**
 * @param {unknown} value
 */
export function normalizePeopleReminderLeadDays(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_PEOPLE_REMINDER_LEAD_DAYS;
  return Math.min(90, Math.max(0, n));
}

/**
 * @param {Record<string, unknown>|null|undefined} settings
 */
export function normalizeEmployerPayrollSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  return {
    trading_name: text(raw.trading_name) || "",
    paye_reference: text(raw.paye_reference) || "",
    uif_reference: text(raw.uif_reference) || "",
    sdl_reference: text(raw.sdl_reference) || "",
    people_reminder_lead_days:
      raw.people_reminder_lead_days == null || raw.people_reminder_lead_days === ""
        ? DEFAULT_PEOPLE_REMINDER_LEAD_DAYS
        : normalizePeopleReminderLeadDays(raw.people_reminder_lead_days),
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
  if (patch && Object.prototype.hasOwnProperty.call(patch, "trading_name")) {
    base.trading_name = next.trading_name || null;
  }
  if (patch && Object.prototype.hasOwnProperty.call(patch, "people_reminder_lead_days")) {
    base.people_reminder_lead_days = next.people_reminder_lead_days;
  }
  return base;
}

/**
 * Build frozen employer snapshot from org row (+ optional profile fallbacks).
 * profileFallback is the org owner's profile (company branding / logo live there).
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

  const tradingName =
    text(settings.trading_name) ||
    (text(profileFallback?.company_name) && text(profileFallback?.company_name) !== name
      ? text(profileFallback?.company_name)
      : null);

  return {
    company_name: name,
    trading_name: tradingName,
    logo_url: text(org?.logo_url) || text(profileFallback?.logo_url) || null,
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
 * Logo: snapshot → org owner branding → viewer (legacy payslips only). The viewer
 * may be the employee, so their profile is the last resort, never the first.
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
    trading_name: text(snap?.trading_name),
    logo_url:
      text(snap?.logo_url) ||
      text(payslip?.owner_logo_url) ||
      text(user?.logo_url) ||
      text(user?.company_logo_url) ||
      null,
    registration_number: text(snap?.registration_number),
    email: text(snap?.email) || text(user?.email) || null,
    phone: text(snap?.phone) || text(user?.phone) || null,
    paye_reference: text(snap?.paye_reference),
    uif_reference: text(snap?.uif_reference),
    sdl_reference: text(snap?.sdl_reference),
  };
}
