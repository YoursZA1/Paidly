/**
 * Helpers for admin / dashboard lists where rows may be sparse (missing `id`).
 */

/** Best-effort primary id for platform user / profile-shaped rows (API updates, selection). */
export function adminRowPrimaryId(row) {
  if (!row || typeof row !== "object") return null;
  const raw = row.id ?? row.supabase_id ?? row.auth_id;
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

/**
 * Stable React `key` for directory-style rows (users, admin alert payloads, behavior table).
 */
export function stableDirectoryRowKey(row, index = 0) {
  const id = adminRowPrimaryId(row);
  if (id) return id;
  const email = String(row?.email || row?.user_email || "").trim().toLowerCase();
  if (email) return `email:${email}@${index}`;
  return `dir:${index}`;
}

/**
 * Stable key for subscriptions, affiliate applications, and similar entities.
 */
export function stableEntityRowKey(row, index = 0) {
  const raw = row?.id;
  if (raw != null && String(raw).trim() !== "") return String(raw);
  const email = String(row?.user_email || row?.email || row?.applicant_email || "")
    .trim()
    .toLowerCase();
  const t = String(row?.created_date || row?.created_at || "").trim();
  if (email && t) return `${email}#${t}@${index}`;
  if (email) return `${email}@${index}`;
  return `ent:${index}`;
}
