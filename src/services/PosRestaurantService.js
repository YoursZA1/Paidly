/**
 * Restaurant POS API client — floors, tables, running table orders (tabs), kitchen tickets, bills.
 * Money goes through /api/pos/tab-pay → Payment Engine; this client never marks anything paid.
 */
import { apiBase, authHeaders, parseApiJsonError, posServiceRequest } from "@/services/PosIntegrationService";

async function request(path, { method = "GET", body, query, fallback = "Restaurant POS request failed" } = {}) {
  const headers = await authHeaders({ includeJsonContentType: Boolean(body) });
  const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== ""))}` : "";
  const res = await posServiceRequest(`${apiBase()}${path}${qs}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const raw = await res.text().catch(() => "");
  return parseApiJsonError(res, raw, fallback);
}

export const fetchRestaurantFloor = () => request("/api/pos/floor", { fallback: "Could not load the floor" });

export const restaurantSetup = (body) => request("/api/pos/floor-setup", { method: "POST", body, fallback: "Could not save the floor setup" });

export const fetchTab = (id) => request("/api/pos/tab", { query: { id }, fallback: "Could not load the order" });

/** action: open | add_items | update_item | void_item | send | details | discount | service_charge |
 *  request_bill | transfer | merge | close | void | mark_clean */
export const tabAction = (action, body = {}) =>
  request("/api/pos/tab", { method: "POST", body: { action, ...body }, fallback: "Could not update the order" });

/** split: { kind: "full" | "equal" | "items" | "amount", parts?, part_index?, item_ids?, amount?, label? } */
export const payTab = (body) => request("/api/pos/tab-pay", { method: "POST", body, fallback: "Payment could not be taken" });

export const fetchKitchen = (station) => request("/api/pos/kitchen", { query: { station }, fallback: "Could not load the kitchen" });

export const moveKitchenTicket = (ticketId, status) =>
  request("/api/pos/kitchen", { method: "POST", body: { ticket_id: ticketId, status }, fallback: "Could not update the ticket" });

export const fetchRestaurantOrders = () => request("/api/pos/orders", { fallback: "Could not load orders" });
