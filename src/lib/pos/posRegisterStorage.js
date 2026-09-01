/**
 * Persist the active POS register (till) per organization on this device.
 * Not a sale. Switching register does not rewrite past pos_sales_events.
 */

const storageKey = (orgId) => `paidly.activePosRegister.${orgId}`;

export function readActiveRegisterId(orgId) {
  if (!orgId || typeof localStorage === "undefined") return null;
  try {
    const id = String(localStorage.getItem(storageKey(orgId)) || "").trim();
    return id || null;
  } catch {
    return null;
  }
}

export function writeActiveRegisterId(orgId, registerId) {
  if (!orgId || typeof localStorage === "undefined") return;
  try {
    const id = String(registerId || "").trim();
    if (!id) localStorage.removeItem(storageKey(orgId));
    else localStorage.setItem(storageKey(orgId), id);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Prefer a till from the URL (`/pos/till/{id}`), then the membership-assigned till
 * (email invite activation), then this device's last till, then the first active register.
 * A requested id that is not in the list returns null — never silently open another till.
 */
export function pickActiveRegister(registers, storedId, assignedId, requestedId) {
  const list = Array.isArray(registers) ? registers : [];
  const active = list.filter((row) => (row.status || "active") === "active");
  if (requestedId) {
    return (
      active.find((row) => row.id === requestedId) ||
      list.find((row) => row.id === requestedId) ||
      null
    );
  }
  if (assignedId) {
    const assigned =
      active.find((row) => row.id === assignedId) || list.find((row) => row.id === assignedId);
    if (assigned) return assigned;
  }
  if (storedId) {
    const stored = active.find((row) => row.id === storedId);
    if (stored) return stored;
  }
  return active[0] || null;
}
