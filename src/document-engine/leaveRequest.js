import { eachDayOfInterval, isWeekend } from "date-fns";

export const LEAVE_TYPES = Object.freeze([
  { key: "annual", label: "Annual leave" },
  { key: "sick", label: "Sick leave" },
  { key: "family", label: "Family responsibility" },
  { key: "unpaid", label: "Unpaid leave" },
  { key: "study", label: "Study leave" },
]);

/** Default balances shown until HR balances are wired to profiles. */
export const DEFAULT_LEAVE_BALANCES = Object.freeze({
  annual: 15,
  sick: 10,
  family: 3,
  unpaid: null,
  study: 5,
});

const LEAVE_TYPE_LABELS = new Map(LEAVE_TYPES.map((t) => [t.key, t.label]));

/** @param {unknown} key */
export function leaveTypeLabel(key) {
  return LEAVE_TYPE_LABELS.get(String(key || "")) || "Leave";
}

/** @param {Record<string, number | null> | undefined} balances @param {unknown} leaveType */
export function leaveBalanceForType(balances, leaveType) {
  const map = balances && typeof balances === "object" ? balances : DEFAULT_LEAVE_BALANCES;
  const value = map[String(leaveType || "annual")];
  return value == null ? null : Number(value);
}

/** Count weekdays between two dates (inclusive). */
export function countBusinessLeaveDays(from, to) {
  if (!(from instanceof Date) || !(to instanceof Date) || Number.isNaN(from) || Number.isNaN(to)) {
    return 0;
  }
  if (to < from) return 0;
  const days = eachDayOfInterval({ start: from, end: to });
  return days.filter((d) => !isWeekend(d)).length;
}
