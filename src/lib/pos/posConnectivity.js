/**
 * POS connectivity policy (V1).
 *
 * Paidly does **not** claim full offline POS. The invoice SyncEngine queue
 * (`CREATE_INVOICE` / `UPDATE_CLIENT` in localStorage) is not a till outbox:
 * checkout needs `/api/pos/checkout` (payment intent, open shift, inventory RPC).
 * Replaying a local “sale” would desync stock, the drawer session, and receipts.
 *
 * Therefore:
 * - Do not enqueue POS sales on the invoice sync queue.
 * - Do not store card / Ozow / PayFast credentials on the device.
 * - Do not mark card or digital paid while offline.
 * - Do not treat a queued cash row as a completed `pos_sales_events` sale.
 * Cash checkout is online-only in V1 (same as card/digital). Cart hold stays
 * device `sessionStorage` — that is not a sale.
 */

export const POS_CONNECTIVITY = Object.freeze({
  ONLINE: "online",
  RECONNECTING: "reconnecting",
  OFFLINE: "offline",
});

/** Explicit: existing SyncEngine jobs cannot safely record till money. */
export const POS_OFFLINE_QUEUE_SUPPORTED = false;

export function derivePosConnectivity({
  navigatorOnline = true,
  connectionStatus = "connected",
  sessionStatus = "connected",
} = {}) {
  if (navigatorOnline === false) return POS_CONNECTIVITY.OFFLINE;
  if (sessionStatus === "reauth_required" || sessionStatus === "expired") {
    return POS_CONNECTIVITY.OFFLINE;
  }
  if (connectionStatus === "disconnected") return POS_CONNECTIVITY.OFFLINE;
  if (connectionStatus === "reconnecting") return POS_CONNECTIVITY.RECONNECTING;
  if (sessionStatus === "reconnecting" || sessionStatus === "degraded") {
    return POS_CONNECTIVITY.RECONNECTING;
  }
  return POS_CONNECTIVITY.ONLINE;
}

export function posCheckoutAllowed(state) {
  return state === POS_CONNECTIVITY.ONLINE;
}

export function posServerWriteAllowed(state) {
  return posCheckoutAllowed(state);
}

export function posOfflineCheckoutMessage(state) {
  if (state === POS_CONNECTIVITY.ONLINE) return null;
  if (state === POS_CONNECTIVITY.RECONNECTING) {
    return "Reconnecting. Wait until Online before taking payment. Sales are not stored on this device.";
  }
  return "Offline. Checkout needs a connection. Cash is not queued. Card and digital cannot complete without the payment rail.";
}

export function posConnectivityLabel(state) {
  if (state === POS_CONNECTIVITY.ONLINE) return "Online";
  if (state === POS_CONNECTIVITY.RECONNECTING) return "Reconnecting…";
  return "Offline";
}
