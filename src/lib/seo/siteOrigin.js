/** Canonical public site origin (matches apex → www redirect in index.html). */
export const PAIDLY_SITE_ORIGIN = "https://www.paidly.co.za";

export function absoluteUrl(path = "/") {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${PAIDLY_SITE_ORIGIN}${p === "/" ? "/" : p}`;
}
