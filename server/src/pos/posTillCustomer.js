import { posCustomerEligibleForTill } from "./posCheckoutMath.js";

/**
 * Named till customer must be an org POS customer (pos_enabled), not a general CRM client.
 * Walk-in is represented by a null client_id and does not call this.
 */
export async function loadPosTillCustomer(admin, orgId, clientId) {
  const { data, error } = await admin
    .from("clients")
    .select("id, org_id, pos_enabled, name, email")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    return { ok: false, status: 500, message: error.message || "Could not load POS customer", code: "CLIENT_LOOKUP_FAILED" };
  }
  if (!posCustomerEligibleForTill(data, orgId)) {
    return {
      ok: false,
      status: 422,
      message: "Attach a POS customer, or leave the sale as walk-in.",
      code: "POS_CUSTOMER_REQUIRED",
    };
  }
  return { ok: true, client: data };
}
