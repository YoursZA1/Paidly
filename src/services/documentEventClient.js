import { supabase } from "@/lib/supabaseClient";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
  assertEventAllowedForSource,
  buildDocumentEventIdempotencyKey,
  documentEventSourceFromType,
} from "@shared/documents/documentEvents.js";
import { sanitizeDocumentEventMetadata } from "@shared/documents/documentEngine.js";

export async function appendCommercialDocumentEventBestEffort({
  orgId,
  sourceKind,
  sourceId,
  documentType,
  eventType,
  clientId = null,
  actorType = DOCUMENT_EVENT_ACTOR.USER,
  sendAttemptId = null,
  reminderType = null,
  metadata = {},
} = {}) {
  const org = String(orgId || "").trim();
  const id = String(sourceId || "").trim();
  const kind = String(sourceKind || "").trim().toLowerCase();
  if (!org || !id || !kind || !eventType) return null;
  try {
    assertEventAllowedForSource(kind, eventType);
  } catch (err) {
    console.warn("[document-events]", err?.message || err);
    return null;
  }
  const occurredAt = new Date().toISOString();
  const payload = sanitizeDocumentEventMetadata(
    kind,
    metadata && typeof metadata === "object" ? metadata : {}
  );
  const idempotencyKey = buildDocumentEventIdempotencyKey({
    eventType,
    sourceKind: kind,
    sourceId: id,
    sendAttemptId: sendAttemptId || payload.send_attempt_id,
    reminderType: reminderType || payload.reminder_type,
    action: payload.action,
    invoiceId: payload.invoice_id,
    channel: payload.source || payload.channel,
    at: occurredAt,
  });
  try {
    const { error } = await supabase.from("document_events").insert({
      org_id: org,
      document_id: kind === DOCUMENT_EVENT_SOURCE.HUB ? id : null,
      source_kind: kind,
      source_id: id,
      document_type: documentType || kind,
      event_type: eventType,
      payload,
      actor_type: actorType,
      client_id: clientId || null,
      occurred_at: occurredAt,
      idempotency_key: idempotencyKey,
    });
    if (error && error.code !== "23505") {
      console.warn("[document-events]", error.message || error);
    }
  } catch (err) {
    console.warn("[document-events]", err?.message || err);
  }
  return null;
}

export async function recordQuoteLifecycleEvent({ orgId, quoteId, clientId, eventType, metadata = {} }) {
  return appendCommercialDocumentEventBestEffort({
    orgId,
    sourceKind: DOCUMENT_EVENT_SOURCE.QUOTE,
    sourceId: quoteId,
    documentType: "quote",
    eventType,
    clientId,
    metadata,
  });
}

export async function recordDocumentSentEvent({ orgId, documentType, documentId, clientId, sendAttemptId, channel = "email" }) {
  const kind = documentEventSourceFromType(documentType) || DOCUMENT_EVENT_SOURCE.INVOICE;
  return appendCommercialDocumentEventBestEffort({
    orgId,
    sourceKind: kind,
    sourceId: documentId,
    documentType: kind,
    eventType: DOCUMENT_EVENT_TYPE.sent,
    clientId: kind === DOCUMENT_EVENT_SOURCE.PAYSLIP ? null : clientId,
    sendAttemptId,
    metadata: {
      send_attempt_id: sendAttemptId,
      channel,
      source: channel,
    },
  });
}
