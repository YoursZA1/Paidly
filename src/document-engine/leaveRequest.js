import { eachDayOfInterval, isWeekend } from "date-fns";

export const LEAVE_TYPES = Object.freeze([
  { key: "annual", label: "Annual leave" },
  { key: "sick", label: "Sick leave" },
  { key: "family", label: "Family responsibility" },
  { key: "unpaid", label: "Unpaid leave" },
  { key: "study", label: "Study leave" },
]);

/** @deprecated Leftover hub fiction. Live balances come from `/api/leave`. */
export const DEFAULT_LEAVE_BALANCES = Object.freeze({});

const LEAVE_TYPE_LABELS = new Map(LEAVE_TYPES.map((t) => [t.key, t.label]));

/** @param {unknown} key */
export function leaveTypeLabel(key) {
  return LEAVE_TYPE_LABELS.get(String(key || "")) || "Leave";
}

/** @param {Record<string, number | null> | undefined} balances @param {unknown} leaveType */
export function leaveBalanceForType(balances, leaveType) {
  if (!balances || typeof balances !== "object") return null;
  const value = balances[String(leaveType || "annual")];
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
