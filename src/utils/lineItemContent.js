/**
 * Whether a line item row has content worth saving/exporting (not the default empty row).
 * Avoids `qty && unit_price` checks — 0 is falsy and would drop valid zero-price lines.
 */
export function lineItemHasContent(row) {
  const desc = (row.description || row.service_name || row.name || "").trim();
  if (desc) return true;
  const q = Number(row.quantity);
  const u = Number(row.unit_price);
  const total = Number(row.total);
  const qn = Number.isFinite(q) ? q : 0;
  const un = Number.isFinite(u) ? u : 0;
  if (Number.isFinite(total) && Math.abs(total) > 1e-9) return true;
  if (Math.abs(qn * un) > 1e-9) return true;
  if (Math.abs(qn - 1) < 1e-9 && Math.abs(un) < 1e-9) return false;
  if (qn > 0 && Math.abs(un) > 1e-9) return true;
  if (un > 0 && qn >= 0) return true;
  return false;
}
