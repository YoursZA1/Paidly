import { appendDocumentEventBestEffort } from "../documents/documentEventService.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
} from "../../../shared/documents/documentEvents.js";
import { documentPaymentEventTypeForStatus } from "../../../shared/clients/clientRelationshipTimeline.js";

/**
 * Append invoice Observe events from Payment Engine status changes.
 * Does not create a second payment system — writes to document_events only.
 */
export async function appendDocumentPaymentStatusEvent(intent, nextStatus, extra = {}) {
  if (!intent?.id || String(intent.source_kind || "") !== "document" || !intent.document_id) {
    return { event: null, skipped: true };
  }
  const eventType = documentPaymentEventTypeForStatus(nextStatus);
  if (!eventType) return { event: null, skipped: true };

  return appendDocumentEventBestEffort({
    orgId: intent.org_id,
    sourceKind: DOCUMENT_EVENT_SOURCE.INVOICE,
    sourceId: intent.document_id,
    documentType: "invoice",
    eventType,
    clientId: intent.client_id || extra.clientId || null,
    actorType: extra.actorType || DOCUMENT_EVENT_ACTOR.PAYMENT_GATEWAY,
    paymentIntentId: intent.id,
    metadata: {
      payment_intent_id: intent.id,
      amount: intent.amount,
      provider: intent.provider || extra.provider || "ozow",
      status: nextStatus,
      source: extra.source || "payment_engine",
      ...((extra.metadata && typeof extra.metadata === "object") ? extra.metadata : {}),
    },
  });
}
