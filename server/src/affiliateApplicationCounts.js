/**
 * Count affiliate_applications rows by lifecycle status (raw DB or API shapes).
 * DB uses pending | approved | rejected; some paths use accepted / declined.
 */
export function countAffiliateApplicationsByStatus(rows) {
  let pending = 0;
  let approved = 0;
  let declined = 0;
  for (const row of rows || []) {
    const s = String(row?.status ?? "").toLowerCase();
    if (s === "pending") pending += 1;
    else if (s === "approved" || s === "accepted") approved += 1;
    else if (s === "declined" || s === "rejected") declined += 1;
  }
  const list = rows || [];
  return { pending, approved, declined, total: list.length };
}
