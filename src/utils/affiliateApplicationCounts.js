/**
 * Count affiliate application rows by status (DB: pending | approved | rejected; also accepts accepted / declined).
 */
export function countAffiliateApplicationsByStatus(rows) {
  let pending = 0;
  let approved = 0;
  let declined = 0;
  for (const row of rows || []) {
    const s = String(row?.status ?? '').toLowerCase();
    if (s === 'pending') pending += 1;
    else if (s === 'approved' || s === 'accepted') approved += 1;
    else if (s === 'declined' || s === 'rejected') declined += 1;
  }
  const list = rows || [];
  return { pending, approved, declined, total: list.length };
}

export const EMPTY_AFFILIATE_COUNTS = { pending: 0, approved: 0, declined: 0, total: 0 };

export const EMPTY_AFFILIATE_ADMIN_BUNDLE = {
  applications: [],
  counts: { ...EMPTY_AFFILIATE_COUNTS },
};

/** Coerce React Query cache: legacy `[]` or malformed shapes → `{ applications, counts }`. */
export function normalizeAffiliateAdminQueryResult(d) {
  if (d == null) {
    return { applications: [], counts: { ...EMPTY_AFFILIATE_COUNTS } };
  }
  if (Array.isArray(d)) {
    return {
      applications: d,
      counts: countAffiliateApplicationsByStatus(d),
    };
  }
  if (Array.isArray(d.applications)) {
    return {
      applications: d.applications,
      counts: d.counts ?? countAffiliateApplicationsByStatus(d.applications),
    };
  }
  return { applications: [], counts: { ...EMPTY_AFFILIATE_COUNTS } };
}
