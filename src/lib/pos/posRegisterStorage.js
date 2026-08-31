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

export function pickActiveRegister(registers, storedId) {
  const list = Array.isArray(registers) ? registers : [];
  const active = list.filter((row) => (row.status || "active") === "active");
  if (storedId) {
    const match = active.find((row) => row.id === storedId);
    if (match) return match;
  }
  return active[0] || null;
}
