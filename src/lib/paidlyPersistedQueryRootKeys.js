/**
 * React Query roots allowed for durable persistence (localStorage + IndexedDB / Dexie).
 * Never persist auth/session tokens: blocklisted root segments are rejected.
 *
 * @see docs/Paidly-Caching-Architecture.md Layer 2
 */

/** Exact root keys (first segment of `queryKey`) persisted as-is. */
export const PAIDLY_PERSISTED_QUERY_ROOT_KEYS = new Set([
  "invoices",
  "invoice",
  "clients",
  "quotes",
  "cashflow-page",
  "dashboard",
  "dashboard-invoices",
  "dashboard-payslips",
  "admin-settings",
]);

/**
 * Additional safe root prefixes (settings / org / currency read models only — no tokens).
 * Matches `root`, `root-*`, or `root_*`.
 */
const PERSISTED_ROOT_PREFIXES = ["settings", "organization", "organizations", "currency"];

const NEVER_PERSIST_EXACT = new Set(
  ["auth", "session", "token", "password", "secret", "secrets", "refresh", "jwt"].map((s) => s.toLowerCase())
);

const NEVER_PERSIST_PREFIXES = ["sb-", "supabase.auth"];

/**
 * @param {unknown} queryKey
 * @returns {boolean}
 */
export function shouldPersistReactQueryKey(queryKey) {
  if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
  const root = String(queryKey[0] || "").trim();
  if (!root) return false;
  const lower = root.toLowerCase();
  if (NEVER_PERSIST_EXACT.has(lower)) return false;
  if (lower === "auth" || lower.startsWith("auth-") || lower.startsWith("auth_")) return false;
  for (const p of NEVER_PERSIST_PREFIXES) {
    if (lower.startsWith(p.toLowerCase())) return false;
  }
  if (PAIDLY_PERSISTED_QUERY_ROOT_KEYS.has(root)) return true;
  for (const p of PERSISTED_ROOT_PREFIXES) {
    if (root === p || root.startsWith(`${p}-`) || root.startsWith(`${p}_`)) return true;
  }
  return false;
}
