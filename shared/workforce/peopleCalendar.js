/**
 * People Calendar events from membership HR fields.
 * Birthdays require date_of_birth; anniversaries use employment_start_date.
 * Timezone for "today" / window: Africa/Johannesburg (caller passes todayIso).
 */

const ANNIVERSARY_MILESTONES = Object.freeze([1, 2, 3, 5, 10, 15, 20, 25, 30]);

function parseIsoDate(value) {
  const s = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d, iso: s };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Next occurrence of month/day on or after fromIso (inclusive).
 * Handles Feb 29 → Feb 28 in non-leap years.
 * @param {{ month: number, day: number }} md
 * @param {string} fromIso
 */
export function nextOccurrenceOnOrAfter(md, fromIso) {
  const from = parseIsoDate(fromIso);
  if (!from || !md?.month || !md?.day) return null;
  let year = from.year;
  for (let i = 0; i < 3; i += 1) {
    const dim = daysInMonth(year, md.month);
    const day = Math.min(md.day, dim);
    const iso = `${year}-${String(md.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso >= from.iso) return iso;
    year += 1;
  }
  return null;
}

/**
 * @param {string} birthIso
 * @param {string} onIso
 */
export function ageOnDate(birthIso, onIso) {
  const birth = parseIsoDate(birthIso);
  const on = parseIsoDate(onIso);
  if (!birth || !on) return null;
  let age = on.year - birth.year;
  const hadBirthday =
    on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  if (!hadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

/**
 * @param {string} startIso
 * @param {string} onIso
 */
export function yearsOfServiceOnDate(startIso, onIso) {
  return ageOnDate(startIso, onIso);
}

/**
 * @param {string} fromIso
 * @param {number} days
 */
export function addDaysIso(fromIso, days) {
  const from = parseIsoDate(fromIso);
  if (!from) return null;
  const dt = new Date(Date.UTC(from.year, from.month - 1, from.day));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * @param {Array<Record<string, unknown>>} employees
 * @param {{ todayIso: string, daysAhead?: number, includeAge?: boolean }} opts
 */
export function buildPeopleCalendarEvents(employees = [], opts = {}) {
  const todayIso = String(opts.todayIso || "").slice(0, 10);
  const daysAhead = Number.isFinite(Number(opts.daysAhead)) ? Number(opts.daysAhead) : 30;
  const windowEnd = addDaysIso(todayIso, daysAhead) || todayIso;
  const includeAge = opts.includeAge !== false;
  const events = [];

  for (const row of employees || []) {
    if (!row?.id) continue;
    const name = row.full_name || row.label || row.invited_name || "Employee";
    const base = {
      membership_id: String(row.id),
      employee_name: name,
      employee_number: row.employee_number || null,
      department: row.department || null,
      job_title: row.job_title || null,
    };

    const dob = parseIsoDate(row.date_of_birth);
    if (dob) {
      const next = nextOccurrenceOnOrAfter({ month: dob.month, day: dob.day }, todayIso);
      if (next && next <= windowEnd) {
        const age = includeAge ? ageOnDate(dob.iso, next) : null;
        events.push({
          ...base,
          kind: "birthday",
          event_date: next,
          source_date: dob.iso,
          label: age != null ? `${name} — birthday (turns ${age})` : `${name} — birthday`,
          age,
        });
      }
    }

    const start = parseIsoDate(row.employment_start_date);
    if (start) {
      const next = nextOccurrenceOnOrAfter({ month: start.month, day: start.day }, todayIso);
      if (next && next <= windowEnd) {
        const years = yearsOfServiceOnDate(start.iso, next);
        if (years != null && years >= 1) {
          const milestone = ANNIVERSARY_MILESTONES.includes(years) || years % 5 === 0;
          events.push({
            ...base,
            kind: "work_anniversary",
            event_date: next,
            source_date: start.iso,
            years,
            milestone,
            label:
              years === 1
                ? `${name} — 1-year work anniversary`
                : `${name} — ${years}-year work anniversary`,
          });
        }
      }
    }
  }

  events.sort((a, b) => {
    const byDate = String(a.event_date).localeCompare(String(b.event_date));
    if (byDate) return byDate;
    return String(a.employee_name).localeCompare(String(b.employee_name), undefined, { sensitivity: "base" });
  });

  const currentMonth = todayIso.slice(0, 7);
  return {
    today: todayIso,
    window_end: windowEnd,
    days_ahead: daysAhead,
    events,
    upcoming: events.filter((e) => e.event_date >= todayIso && e.event_date <= windowEnd),
    this_month: events.filter((e) => String(e.event_date).startsWith(currentMonth)),
    birthdays: events.filter((e) => e.kind === "birthday"),
    anniversaries: events.filter((e) => e.kind === "work_anniversary"),
  };
}
