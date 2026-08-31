/** Pure POS audit helpers — unit-tested, no I/O. */

export const POS_AUDIT_EVENT = Object.freeze({
  SALE_CREATED: "sale_created",
  PAYMENT: "payment",
  COMPLETION: "completion",
  REFUND: "refund",
  CANCELLATION: "cancellation",
  INVENTORY_MOVEMENT: "inventory_movement",
});

export const POS_AUDIT_ACTOR = Object.freeze({
  USER: "user",
  SYSTEM: "system",
  WEBHOOK: "webhook",
});

const EVENT_TYPES = new Set(Object.values(POS_AUDIT_EVENT));
const ACTOR_TYPES = new Set(Object.values(POS_AUDIT_ACTOR));

export const POS_AUDIT_LABELS = Object.freeze({
  [POS_AUDIT_EVENT.SALE_CREATED]: "Sale created",
  [POS_AUDIT_EVENT.PAYMENT]: "Payment",
  [POS_AUDIT_EVENT.COMPLETION]: "Completed",
  [POS_AUDIT_EVENT.REFUND]: "Refund",
  [POS_AUDIT_EVENT.CANCELLATION]: "Cancelled",
  [POS_AUDIT_EVENT.INVENTORY_MOVEMENT]: "Inventory movement",
});

export function isPosAuditEventType(value) {
  return EVENT_TYPES.has(String(value || ""));
}

export function normalizePosAuditWrite(input = {}) {
  const eventType = String(input.event_type || "").trim();
  if (!EVENT_TYPES.has(eventType)) {
    return { ok: false, error: "Unknown POS audit event type" };
  }
  const actorType = String(input.actor_type || POS_AUDIT_ACTOR.USER).trim() || POS_AUDIT_ACTOR.USER;
  if (!ACTOR_TYPES.has(actorType)) {
    return { ok: false, error: "Unknown POS audit actor type" };
  }
  const orgId = input.org_id ? String(input.org_id).trim() : "";
  if (!orgId) return { ok: false, error: "org_id is required" };

  return {
    ok: true,
    data: {
      org_id: orgId,
      sale_event_id: input.sale_event_id ? String(input.sale_event_id) : null,
      payment_intent_id: input.payment_intent_id ? String(input.payment_intent_id) : null,
      event_type: eventType,
      actor_type: actorType,
      actor_id: input.actor_id ? String(input.actor_id) : null,
      metadata: input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata
        : {},
      occurred_at: input.occurred_at || new Date().toISOString(),
    },
  };
}

export function posAuditSaleCreatedAndPayment({
  orgId,
  saleId,
  intentId = null,
  actorId = null,
  actorType = POS_AUDIT_ACTOR.USER,
  receiptNumber,
  saleKind = "sale",
  amount,
  currency,
  method,
} = {}) {
  const shared = {
    org_id: orgId,
    sale_event_id: saleId,
    payment_intent_id: intentId,
    actor_id: actorId,
    actor_type: actorType,
  };
  return [
    {
      ...shared,
      event_type: POS_AUDIT_EVENT.SALE_CREATED,
      metadata: {
        receipt_number: receiptNumber || null,
        sale_kind: saleKind || "sale",
        total_amount: Number(amount) || 0,
        currency: currency || "ZAR",
      },
    },
    {
      ...shared,
      event_type: POS_AUDIT_EVENT.PAYMENT,
      metadata: {
        method: method || null,
        amount: Number(amount) || 0,
        currency: currency || "ZAR",
      },
    },
  ];
}

export function posAuditInventoryAndCompletion({
  orgId,
  saleId,
  actorId = null,
  actorType = POS_AUDIT_ACTOR.USER,
  direction = "out",
  applied = false,
  failed = false,
  skip = false,
} = {}) {
  if (skip) return [];
  const rows = [
    {
      org_id: orgId,
      sale_event_id: saleId,
      event_type: POS_AUDIT_EVENT.INVENTORY_MOVEMENT,
      actor_id: actorId,
      actor_type: actorType,
      metadata: {
        direction: direction === "in" ? "in" : "out",
        applied: Boolean(applied) && !failed,
        failed: Boolean(failed),
      },
    },
  ];
  if (applied && !failed) {
    rows.push({
      org_id: orgId,
      sale_event_id: saleId,
      event_type: POS_AUDIT_EVENT.COMPLETION,
      actor_id: actorId,
      actor_type: actorType,
      metadata: { status: "completed" },
    });
  }
  return rows;
}

export function posAuditRefund({
  orgId,
  originalSaleId,
  returnId,
  actorId = null,
  amount,
  refundRail,
  receiptNumber,
} = {}) {
  return {
    org_id: orgId,
    sale_event_id: originalSaleId,
    event_type: POS_AUDIT_EVENT.REFUND,
    actor_id: actorId,
    actor_type: POS_AUDIT_ACTOR.USER,
    metadata: {
      return_id: returnId || null,
      receipt_number: receiptNumber || null,
      amount: Math.abs(Number(amount) || 0),
      refund_rail: refundRail || null,
    },
  };
}

export function posAuditCancellation({
  orgId,
  intentId,
  actorId = null,
  reason,
  intentStatus,
  paymentMethod,
} = {}) {
  return {
    org_id: orgId,
    sale_event_id: null,
    payment_intent_id: intentId || null,
    event_type: POS_AUDIT_EVENT.CANCELLATION,
    actor_id: actorId,
    actor_type: POS_AUDIT_ACTOR.USER,
    metadata: {
      reason: reason || "unpaid_intent",
      intent_status: intentStatus || null,
      payment_method: paymentMethod || null,
    },
  };
}

export function publicPosAuditView(row) {
  if (!row) return null;
  const eventType = row.event_type || null;
  return {
    id: row.id,
    event_type: eventType,
    label: POS_AUDIT_LABELS[eventType] || eventType,
    actor_type: row.actor_type || POS_AUDIT_ACTOR.SYSTEM,
    actor_id: row.actor_id || null,
    sale_event_id: row.sale_event_id || null,
    payment_intent_id: row.payment_intent_id || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    occurred_at: row.occurred_at || row.created_at || null,
  };
}
