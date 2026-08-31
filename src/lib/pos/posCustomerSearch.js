/** POS customer search — same `clients` table as back office, not a second store. */

export const WALK_IN_CUSTOMER_LABEL = "Walk-in Customer";

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
  return [client?.name, client?.email, client?.phone, client?.contact_person].some((value) =>
    String(value || "").toLowerCase().includes(term)
  );
}

export function filterPosCustomers(clients, query, limit = 12) {
  const list = Array.isArray(clients) ? clients : [];
  const matched = list.filter((row) => matchPosCustomer(row, query));
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
