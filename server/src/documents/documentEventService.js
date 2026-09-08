import { supabaseAdmin } from "../supabaseAdmin.js";
import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
  assertDocumentEventSource,
  assertEventAllowedForSource,
  buildDocumentEventIdempotencyKey,
  documentEventSourceFromType,
} from "../../../shared/documents/documentEvents.js";
import { sanitizeDocumentEventMetadata } from "../../../shared/documents/documentEngine.js";

function payloadFrom(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return { ...metadata };
}

export async function appendDocumentEvent(input = {}, client = supabaseAdmin) {
  const sourceKind = assertDocumentEventSource(input.sourceKind || input.source_kind);
  const sourceId = String(input.sourceId || input.source_id || "").trim();
  const eventType = assertEventAllowedForSource(sourceKind, input.eventType || input.event_type);
  const orgId = String(input.orgId || input.org_id || "").trim();
  if (!orgId || !sourceId || !eventType) {
    const error = new Error("org_id, source_id, and event_type are required");
    error.code = "DOCUMENT_EVENT_INVALID";
    throw error;
  }

  const occurredAt = input.occurredAt || input.occurred_at || new Date().toISOString();
  const metadata = sanitizeDocumentEventMetadata(
    sourceKind,
    payloadFrom(input.metadata || input.payload)
  );
  const idempotencyKey =
    input.idempotencyKey ||
    input.idempotency_key ||
    buildDocumentEventIdempotencyKey({
      eventType,
      sourceKind,
      sourceId,
      sendAttemptId: input.sendAttemptId || metadata.send_attempt_id,
      action: input.action || metadata.action,
      reminderType: input.reminderType || metadata.reminder_type,
      dueDate: input.dueDate || metadata.due_date,
      days: input.days ?? metadata.days,
      paymentIntentId: input.paymentIntentId || metadata.payment_intent_id,
      paymentId: input.paymentId || metadata.payment_id,
      invoiceId: input.invoiceId || metadata.invoice_id,
      channel: input.channel || metadata.channel || metadata.source,
      at: occurredAt,
    });

  const row = {
    org_id: orgId,
    document_id: sourceKind === DOCUMENT_EVENT_SOURCE.HUB ? sourceId : null,
    source_kind: sourceKind,
    source_id: sourceId,
    document_type: input.documentType || input.document_type || sourceKind,
    event_type: eventType,
    payload: metadata,
    actor_user_id: input.actorUserId || input.actor_user_id || null,
    actor_type: input.actorType || input.actor_type || DOCUMENT_EVENT_ACTOR.SYSTEM,
    client_id: sourceKind === DOCUMENT_EVENT_SOURCE.PAYSLIP ? null : input.clientId || input.client_id || null,
    occurred_at: occurredAt,
    idempotency_key: idempotencyKey || null,
    payment_intent_id: input.paymentIntentId || input.payment_intent_id || null,
  };

  const { data, error } = await client.from("document_events").insert(row).select("*").single();
  if (!error) return { event: data, duplicate: false };

  if (error.code === "23505" && idempotencyKey) {
    const { data: existing } = await client
      .from("document_events")
      .select("*")
      .eq("org_id", orgId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return { event: existing, duplicate: true };
  }
  throw error;
}

export async function appendDocumentEventBestEffort(input, client = supabaseAdmin) {
  try {
    return await appendDocumentEvent(input, client);
  } catch (err) {
    console.warn("[document-events]", err?.message || err);
    return { event: null, duplicate: false, error: err };
  }
}

export async function listDocumentEvents({ orgId, sourceKind, sourceId, limit = 100 }, client = supabaseAdmin) {
  const source = assertDocumentEventSource(sourceKind);
  const id = String(sourceId || "").trim();
  let query = client
    .from("document_events")
    .select("*")
    .eq("org_id", orgId)
    .eq("source_kind", source)
    .order("occurred_at", { ascending: false })
    .limit(Math.min(200, Math.max(1, Number(limit) || 100)));
  query = source === DOCUMENT_EVENT_SOURCE.HUB ? query.eq("document_id", id) : query.eq("source_id", id);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function listOrgEngagementEvents({ orgId, limit = 2000 }, client = supabaseAdmin) {
  const { data, error } = await client
    .from("document_events")
    .select("id, org_id, source_kind, source_id, document_id, event_type, payload, occurred_at, created_at")
    .eq("org_id", orgId)
    .in("source_kind", [DOCUMENT_EVENT_SOURCE.INVOICE, DOCUMENT_EVENT_SOURCE.QUOTE])
    .order("occurred_at", { ascending: false })
    .limit(Math.min(5000, Math.max(1, Number(limit) || 2000)));
  if (error) throw error;
  return data || [];
}

export async function recordPublicDocumentOpened({
  orgId,
  sourceKind,
  sourceId,
  clientId = null,
  source = "public_page",
} = {}, client = supabaseAdmin) {
  return recordPublicDocumentInteraction(
    {
      orgId,
      sourceKind,
      sourceId,
      clientId,
      eventType: DOCUMENT_EVENT_TYPE.opened,
      source,
    },
    client
  );
}

export async function recordPublicDocumentInteraction({
  orgId,
  sourceKind,
  sourceId,
  clientId = null,
  eventType,
  action = null,
  source = "public_page",
  metadata = {},
} = {}, client = supabaseAdmin) {
  if (!orgId || !sourceId || !eventType) return { event: null, skipped: true };
  const kind = assertDocumentEventSource(sourceKind);
  return appendDocumentEventBestEffort(
    {
      orgId,
      sourceKind: kind,
      sourceId,
      documentType: kind,
      eventType,
      clientId: kind === DOCUMENT_EVENT_SOURCE.PAYSLIP ? null : clientId,
      actorType: DOCUMENT_EVENT_ACTOR.RECIPIENT,
      channel: source,
      action,
      metadata: {
        source,
        channel: source,
        action: action || null,
        ...metadata,
      },
    },
    client
  );
}

export async function appendEventFromMessageLog(log, eventType, extra = {}, client = supabaseAdmin) {
  if (!log?.org_id || !log?.document_id) return { event: null, skipped: true };
  const sourceKind =
    documentEventSourceFromType(log.document_type) || DOCUMENT_EVENT_SOURCE.INVOICE;
  return appendDocumentEventBestEffort(
    {
      orgId: log.org_id,
      sourceKind,
      sourceId: log.document_id,
      documentType: sourceKind,
      eventType,
      clientId: sourceKind === DOCUMENT_EVENT_SOURCE.PAYSLIP ? null : log.client_id || null,
      actorType: DOCUMENT_EVENT_ACTOR.RECIPIENT,
      channel: extra.channel || log.channel || "email",
      action: extra.action,
      metadata: {
        source: extra.source || "email_track",
        channel: extra.channel || log.channel || "email",
        action: extra.action || null,
        tracking_token: log.tracking_token || null,
        ...extra.metadata,
      },
    },
    client
  );
}
