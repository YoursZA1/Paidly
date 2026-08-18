import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";

/**
 * Same-origin first, then VITE_SERVER_URL / admin API base.
 * @param {string} [search] query including leading `?`, or empty
 * @returns {string[]}
 */
export function buildAdminSubscriptionsUrls(search = "") {
  const q = search && !search.startsWith("?") ? `?${search}` : search || "";
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(`/api/admin/subscriptions${q}`);
  const base = String(getAdminDataApiBase() || "").trim().replace(/\/$/, "");
  if (base) push(`${base}/api/admin/subscriptions${q}`);
  const envBase = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (envBase && envBase !== base) push(`${envBase}/api/admin/subscriptions${q}`);
  return out;
}
