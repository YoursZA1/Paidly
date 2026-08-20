/**
 * Canonical subscription_events.event_type values — ALLOWED ONLY. Never invent.
 * Event Timeline (product): Created → Redirected → ITN Received → Verified → Activated → Renewed → Cancelled
 */

/**
 * @typedef {'subscription_created'|'redirected'|'payment_pending'|'payment_verified'|'payment_failed'|'activated'|'cancelled'|'renewed'|'webhook_received'|'webhook_verified'|'webhook_failed'} SubscriptionEventType
 */

/** @type {readonly SubscriptionEventType[]} */
export const SUBSCRIPTION_EVENT_TYPES = Object.freeze([
  "subscription_created",
  "redirected",
  "payment_pending",
  "payment_verified",
  "payment_failed",
  "activated",
  "cancelled",
  "renewed",
  "webhook_received",
  "webhook_verified",
  "webhook_failed",
]);

export const SUBSCRIPTION_EVENT_TYPE = Object.freeze({
  SUBSCRIPTION_CREATED: "subscription_created",
  REDIRECTED: "redirected",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_VERIFIED: "payment_verified",
  PAYMENT_FAILED: "payment_failed",
  ACTIVATED: "activated",
  CANCELLED: "cancelled",
  RENEWED: "renewed",
  WEBHOOK_RECEIVED: "webhook_received",
  WEBHOOK_VERIFIED: "webhook_verified",
  WEBHOOK_FAILED: "webhook_failed",
});

/** Human labels for admin / logs */
export const SUBSCRIPTION_EVENT_LABELS = Object.freeze({
  subscription_created: "Created",
  redirected: "Redirected",
  payment_pending: "Redirected",
  webhook_received: "ITN Received",
  webhook_verified: "Verified",
  activated: "Activated",
  payment_verified: "Payment Verified",
  payment_failed: "Payment Failed",
  renewed: "Renewed",
  cancelled: "Cancelled",
  webhook_failed: "Webhook Failed",
});

/**
 * Ordered Event Timeline stages for Admin Subscription Details.
 * Each stage maps one or more DB event_type values (first match wins when building).
 */
export const SUBSCRIPTION_TIMELINE_STAGES = Object.freeze([
  {
    key: "created",
    label: "Created",
    eventTypes: Object.freeze(["subscription_created"]),
  },
  {
    key: "redirected",
    label: "Redirected",
    eventTypes: Object.freeze(["redirected", "payment_pending"]),
  },
  {
    key: "itn_received",
    label: "ITN Received",
    eventTypes: Object.freeze(["webhook_received"]),
  },
  {
    key: "verified",
    label: "Verified",
    eventTypes: Object.freeze(["webhook_verified"]),
  },
  {
    key: "activated",
    label: "Activated",
    /** `payment_verified` is a legacy fallback when `activated` was not yet emitted. */
    eventTypes: Object.freeze(["activated", "payment_verified"]),
  },
  {
    key: "renewed",
    label: "Renewed",
    eventTypes: Object.freeze(["renewed"]),
  },
  {
    key: "cancelled",
    label: "Cancelled",
    eventTypes: Object.freeze(["cancelled"]),
  },
]);

/**
 * @param {string} raw
 * @returns {SubscriptionEventType | null}
 */
export function coerceSubscriptionEventType(raw) {
  let t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!t) return null;
  if (t === "created") t = "subscription_created";
  if (t === "canceled" || t === "cancel") t = "cancelled";
  if (t === "redirect" || t === "payfast_redirect") t = "redirected";
  if (t === "activate" || t === "activation") t = "activated";
  if (t === "itn_received") t = "webhook_received";
  if (t === "itn_verified" || t === "verified") t = "webhook_verified";
  if (t === "itn_failed") t = "webhook_failed";
  if (t === "payment_completed" || t === "paymentcompleted") t = "payment_verified";
  if (SUBSCRIPTION_EVENT_TYPES.includes(/** @type {SubscriptionEventType} */ (t))) {
    return /** @type {SubscriptionEventType} */ (t);
  }
  return null;
}

/**
 * @param {string} raw
 * @returns {SubscriptionEventType}
 */
export function normalizeSubscriptionEventType(raw) {
  const t = coerceSubscriptionEventType(raw);
  if (!t) {
    throw new Error(
      `invalid subscription event type "${raw}" — allowed: ${SUBSCRIPTION_EVENT_TYPES.join(", ")}`
    );
  }
  return t;
}

/**
 * Build Event Timeline stages with first occurrence timestamps from event rows.
 * @param {Array<{ event_type?: string, type?: string, created_at?: string, date?: string, id?: string }>} events
 */
export function buildSubscriptionEventTimeline(events) {
  const rows = Array.isArray(events) ? events : [];
  const byType = new Map();
  for (const e of rows) {
    const type = coerceSubscriptionEventType(e?.event_type || e?.type);
    if (!type) continue;
    const at = e.created_at || e.date || null;
    const prev = byType.get(type);
    if (!prev) {
      byType.set(type, { at, id: e.id || null });
      continue;
    }
    // Keep earliest occurrence for "reached" stages
    if (at && (!prev.at || new Date(at) < new Date(prev.at))) {
      byType.set(type, { at, id: e.id || null });
    }
  }

  return SUBSCRIPTION_TIMELINE_STAGES.map((stage) => {
    let hit = null;
    for (const t of stage.eventTypes) {
      if (byType.has(t)) {
        hit = byType.get(t);
        break;
      }
    }
    return {
      key: stage.key,
      label: stage.label,
      reached: Boolean(hit),
      at: hit?.at || null,
      eventId: hit?.id || null,
    };
  });
}
