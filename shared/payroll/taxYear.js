// @ts-check
/**
 * South African tax year (SARS): 1 March → last day of February, in Africa/Johannesburg civil dates.
 * The tax year of a payroll period is decided by its payment date (PAYE is deducted when paid).
 * Pure: no clock, no timezone of the machine.
 */
import { compareIsoDate, daysInMonth, formatIsoDate, parseIsoDate } from "./dates.js";

/**
 * @param {string} iso YYYY-MM-DD (payment date; falls back to period end at the caller)
 * @returns {{ code: number, label: string, start: string, end: string }}
 *   code = the year the tax year ends (SARS "2027 tax year" = 1 Mar 2026 – 28 Feb 2027), label "2026/27"
 */
export function taxYearForDate(iso) {
  const parsed = parseIsoDate(String(iso || "").slice(0, 10));
  if (!parsed) throw new Error(`Invalid payroll date: ${iso}`);
  const startYear = parsed.month >= 3 ? parsed.year : parsed.year - 1;
  const endYear = startYear + 1;
  return {
    code: endYear,
    label: `${startYear}/${String(endYear).slice(-2)}`,
    start: formatIsoDate(startYear, 3, 1),
    end: formatIsoDate(endYear, 2, daysInMonth(endYear, 2)),
  };
}

export function isWithinTaxYear(iso, taxYear) {
  const d = String(iso || "").slice(0, 10);
  return Boolean(d) && compareIsoDate(d, taxYear.start) >= 0 && compareIsoDate(d, taxYear.end) <= 0;
}

/** Pay periods in a tax year for a frequency. */
export function periodsPerTaxYear(frequency) {
  const freq = String(frequency || "monthly").toLowerCase();
  if (freq === "weekly") return 52;
  if (freq === "bi_weekly") return 26;
  return 12;
}

/**
 * 1-based position of a monthly period in its tax year (March = 1 … February = 12).
 * @param {string} iso
 */
export function monthIndexInTaxYear(iso) {
  const parsed = parseIsoDate(String(iso || "").slice(0, 10));
  if (!parsed) return null;
  return ((parsed.month - 3 + 12) % 12) + 1;
}

/**
 * Age in whole years on a date (birthday counts on the day itself).
 * @param {string | null | undefined} dobIso
 * @param {string} onIso
 */
export function ageOnDate(dobIso, onIso) {
  const dob = parseIsoDate(String(dobIso || "").slice(0, 10));
  const on = parseIsoDate(String(onIso || "").slice(0, 10));
  if (!dob || !on) return null;
  let age = on.year - dob.year;
  if (on.month < dob.month || (on.month === dob.month && on.day < dob.day)) age -= 1;
  return age;
}

/**
 * SARS rebates use age on the last day of the tax year (someone turning 65 in the year gets the
 * secondary rebate for the whole year).
 */
export function ageAtTaxYearEnd(dobIso, taxYear) {
  return ageOnDate(dobIso, taxYear.end);
}

/**
 * Date of birth from a 13-digit SA ID number (YYMMDD…). Century: a year later than the tax year is
 * read as 19xx. Returns null when the ID is not a valid date.
 * @param {string | null | undefined} idNumber
 * @param {number} [referenceYear] tax-year code, to resolve the century
 */
export function dobFromSaIdNumber(idNumber, referenceYear = 2100) {
  const digits = String(idNumber || "").replace(/\D/g, "");
  if (digits.length !== 13) return null;
  const yy = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  const centuryYear = 2000 + yy > referenceYear ? 1900 + yy : 2000 + yy;
  const iso = formatIsoDate(centuryYear, mm, dd);
  return parseIsoDate(iso) ? iso : null;
}
