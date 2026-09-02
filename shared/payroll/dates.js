import { PAYROLL_TIMEZONE } from "./constants.js";

/**
 * Calendar Y-M-D in Africa/Johannesburg. Do not use Date#getDate() (browser/UTC).
 * @param {Date | string | number} input
 * @returns {{ year: number, month: number, day: number, iso: string }}
 */
export function johannesburgYmd(input = new Date()) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date");
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PAYROLL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  return {
    year,
    month,
    day,
    iso: `${map.year}-${map.month}-${map.day}`,
  };
}

/** @param {number} year */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** @param {number} year @param {number} month 1-12 */
export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Inclusive civil-date iterator in the payroll timezone calendar (not UTC wall-clock).
 * @param {string} startIso YYYY-MM-DD
 * @param {string} endIso YYYY-MM-DD
 * @returns {string[]}
 */
export function eachIsoDateInclusive(startIso, endIso) {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return [];
  if (compareIsoDate(endIso, startIso) < 0) return [];
  const out = [];
  let y = start.year;
  let m = start.month;
  let d = start.day;
  const guard = 400;
  let n = 0;
  while (n < guard * 12) {
    const iso = formatIsoDate(y, m, d);
    out.push(iso);
    if (iso === endIso) break;
    d += 1;
    const dim = daysInMonth(y, m);
    if (d > dim) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    n += 1;
  }
  return out;
}

/** @param {string} iso */
export function parseIsoDate(iso) {
  const match = String(iso || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatIsoDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function compareIsoDate(a, b) {
  return String(a).localeCompare(String(b));
}

/**
 * JS weekday for a civil date: 0 Sun … 6 Sat, using UTC noon so DST cannot shift the day.
 * @param {string} iso
 */
export function weekdayUtcNoon(iso) {
  const parsed = parseIsoDate(iso);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0)).getUTCDay();
}

export function isWeekendIso(iso) {
  const day = weekdayUtcNoon(iso);
  return day === 0 || day === 6;
}

/**
 * SA leave year: 1 March → 28/29 Feb, in Johannesburg.
 * Falls back to calendar year when policy.leave_year_start_month is 1.
 * @param {string} iso
 * @param {number} [startMonth=1]
 */
export function leaveYearForDate(iso, startMonth = 1) {
  const parsed = parseIsoDate(iso) || johannesburgYmd();
  const sm = Number(startMonth) > 0 && Number(startMonth) <= 12 ? Number(startMonth) : 1;
  if (parsed.month >= sm) return parsed.year;
  return parsed.year - 1;
}

export function monthLabel(year, month) {
  const date = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** First/last civil date of a calendar month. */
export function monthBounds(year, month) {
  return {
    start: formatIsoDate(year, month, 1),
    end: formatIsoDate(year, month, daysInMonth(year, month)),
  };
}
