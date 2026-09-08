import { getAdminDataApiBase } from "@/api/backendClient";
import { shouldSkipAdminFetchAbsoluteUrl } from "@/lib/apiOrigin";

/**
 * Same-origin first, then configured admin/API bases.
 * @param {string} resource
 * @param {string} [search]
 * @returns {string[]}
 */
export function buildAdminApiUrls(resource, search = "") {
  const path = String(resource || "").replace(/^\/+|\/+$/g, "");
  const q = search && !search.startsWith("?") ? `?${search}` : search || "";
  const out = [];
  const seen = new Set();
  const push = (u) => {
    if (!u || seen.has(u)) return;
    if (shouldSkipAdminFetchAbsoluteUrl(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(`/api/admin/${path}${q}`);
  const base = String(getAdminDataApiBase() || "").trim().replace(/\/$/, "");
  if (base) push(`${base}/api/admin/${path}${q}`);
  const envBase = String(import.meta.env.VITE_SERVER_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (envBase && envBase !== base) push(`${envBase}/api/admin/${path}${q}`);
  return out;
}
