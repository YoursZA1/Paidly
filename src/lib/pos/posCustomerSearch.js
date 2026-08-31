/** POS customer search — `clients` rows with pos_enabled, not the full Paidly CRM list. */

export const WALK_IN_CUSTOMER_LABEL = "Walk-in Customer";
export const POS_CUSTOMER_SELECT = "id, name, phone";

export function sanitizePosCustomerQuery(raw) {
  return String(raw || "")
    .replace(/[%_,()*"']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function matchPosCustomer(client, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;
  return [client?.name, client?.phone].some((value) => String(value || "").toLowerCase().includes(term));
}

export function filterPosCustomers(clients, query, limit = 12) {
  const list = Array.isArray(clients) ? clients : [];
  const matched = list.filter((row) => row?.pos_enabled === true && matchPosCustomer(row, query));
  return matched.slice(0, limit);
}

export function mergePosCustomerResults(primary, extra, limit = 12) {
  const seen = new Set();
  const out = [];
  for (const row of [...(primary || []), ...(extra || [])]) {
    const id = row?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** Display-only mask so cashiers do not see a full phone number in the picker. */
export function formatPosCustomerPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 3) return "";
  return `${digits.slice(0, 3)} xxx xxxx`;
}
