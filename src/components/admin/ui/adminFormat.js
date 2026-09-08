import { format, formatDistanceToNow } from "date-fns";

export function formatAdminZar(amount) {
  if (amount == null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `R ${n.toLocaleString("en-ZA", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatAdminChange(change) {
  if (change == null || !Number.isFinite(Number(change))) return null;
  const n = Number(change);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n}%`;
}

export function formatAdminDate(value, pattern = "dd MMM yyyy") {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  try {
    return format(d, pattern);
  } catch {
    return "—";
  }
}

export function formatAdminRelative(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "—";
  }
}

export function greetingForHour(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
