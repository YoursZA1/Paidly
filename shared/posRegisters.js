/** POS register name identity — unique per org brand, not org-wide. */

export function registerNameKey(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * @param {Array<{ id?: string, name?: string, company_id?: string|null }>} registers
 * @param {{ name: string, companyId?: string|null, excludeId?: string|null }} query
 */
export function findConflictingRegister(registers, query) {
  const key = registerNameKey(query?.name);
  if (!key) return null;
  const brand = query?.companyId || null;
  const excludeId = query?.excludeId || null;
  return (
    (Array.isArray(registers) ? registers : []).find((row) => {
      if (excludeId && row.id === excludeId) return false;
      if ((row.company_id || null) !== brand) return false;
      return registerNameKey(row.name) === key;
    }) || null
  );
}
