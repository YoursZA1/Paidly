/**
 * Avoid showing the same string twice when profile full_name duplicates email.
 * @returns {{ primary: string, secondary: string | null }}
 */
export function adminUserNameEmailLines(fullName, email) {
  const e = String(email || "").trim();
  const n = String(fullName || "").trim();
  const el = e.toLowerCase();
  const nl = n.toLowerCase();
  if (e && nl === el) {
    return { primary: e, secondary: null };
  }
  if (n && e) {
    return { primary: n, secondary: e };
  }
  return { primary: n || e || "—", secondary: null };
}
