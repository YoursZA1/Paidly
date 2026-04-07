/**
 * Ownership helpers for invoices, quotes, and payslips.
 * Rows store `user_id` (and/or `created_by` / `created_by_id`) for the authenticated creator.
 */

export function rowMatchesDocumentOwner(row, userId) {
  if (!userId || !row) return true;
  const u = String(userId);
  if (row.user_id && String(row.user_id) === u) return true;
  if (row.created_by && String(row.created_by) === u) return true;
  if (row.created_by_id && String(row.created_by_id) === u) return true;
  // Legacy rows created before user_id was populated: still in org-scoped list — count for current user
  if (!row.user_id && !row.created_by && !row.created_by_id) return true;
  return false;
}

export function countDocumentsForUser(rows, userId) {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r) => rowMatchesDocumentOwner(r, userId)).length;
}

/** Aggregate counts per auth user id (for admin dashboards). */
export function countByUserId(rows) {
  const m = new Map();
  if (!Array.isArray(rows)) return m;
  for (const row of rows) {
    const uid = row?.user_id || row?.created_by || row?.created_by_id;
    if (!uid) continue;
    const k = String(uid);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

/**
 * Merge invoice totals onto platform users with a stable fallback order:
 * 1) Count by user id from invoice ownership fields
 * 2) Count by user email from invoice user_email/owner_email
 * 3) Existing profile/admin payload fallback (invoices_sent/invoices_count)
 */
export function mergeUsersWithInvoiceCounts(users, invoices) {
  const safeUsers = Array.isArray(users) ? users : [];
  const invoiceCountByUser = countByUserId(invoices);
  const invoiceCountByEmail = new Map();

  for (const inv of Array.isArray(invoices) ? invoices : []) {
    const email = String(inv?.user_email || inv?.owner_email || '')
      .trim()
      .toLowerCase();
    if (!email) continue;
    invoiceCountByEmail.set(email, Number(invoiceCountByEmail.get(email) || 0) + 1);
  }

  return safeUsers.map((u) => {
    const email = String(u?.email || '')
      .trim()
      .toLowerCase();
    const byUid = Number(invoiceCountByUser.get(String(u?.id || '')) || 0);
    const byEmail = Number(invoiceCountByEmail.get(email) || 0);
    const profileFallback = Number(u?.invoices_sent ?? u?.invoices_count ?? 0);
    return {
      ...u,
      invoices_sent: byUid || byEmail || profileFallback,
    };
  });
}
