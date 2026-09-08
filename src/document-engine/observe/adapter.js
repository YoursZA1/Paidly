import {
  DOCUMENT_EVENT_ACTOR,
  DOCUMENT_EVENT_TYPE,
  documentEventSourceFromType,
} from "@shared/documents/documentEvents.js";
import {
  DOCUMENT_ENGINE_ERROR,
  DocumentEngineError,
  createDocumentContext,
  defaultObserveClickAction,
  sanitizeDocumentEventMetadata,
} from "@shared/documents/documentEngine.js";
import { appendCommercialDocumentEventBestEffort } from "@/services/documentEventClient";

function sourceKindFromContext(context) {
  return documentEventSourceFromType(context.documentType) || context.documentType;
}

export async function observeDocument(input = {}) {
  const context = input.context?.documentType
    ? input.context
    : createDocumentContext(input.context || input);
  const eventType = String(input.eventType || input.actionType || "").trim().toLowerCase();
  if (!eventType) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.INVALID_DOCUMENT_STATE,
      "Observation event type is required"
    );
  }
  const metadata = sanitizeDocumentEventMetadata(context.documentType, {
    source: input.source || input.channel || "document_engine",
    channel: input.channel || "app",
    action: input.action || null,
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
  });
  return appendCommercialDocumentEventBestEffort({
    orgId: context.businessId,
    sourceKind: sourceKindFromContext(context),
    sourceId: context.documentId,
    documentType: context.documentType,
    eventType,
    clientId: context.documentType === "payslip" ? null : context.clientId,
    actorType: input.actorType || DOCUMENT_EVENT_ACTOR.RECIPIENT,
    sendAttemptId: input.sendAttemptId,
    metadata,
  });
}

export async function observeDocumentOpened(input = {}) {
  return observeDocument({
    ...input,
    eventType: DOCUMENT_EVENT_TYPE.opened,
    source: input.source || "public_page",
  });
}

export async function observeDocumentClicked(input = {}) {
  const context = input.context?.documentType
    ? input.context
    : createDocumentContext(input.context || input);
  return observeDocument({
    ...input,
    context,
    eventType: DOCUMENT_EVENT_TYPE.clicked,
    action: input.action || defaultObserveClickAction(context.documentType),
    metadata: {
      action: input.action || defaultObserveClickAction(context.documentType),
      ...(input.metadata || {}),
    },
  });
}

export async function observeDocumentDownloaded(input = {}) {
  return observeDocument({
    ...input,
    eventType: DOCUMENT_EVENT_TYPE.downloaded,
    action: "download_payslip",
    source: input.source || "secure_download",
  });
}

export async function observeDeliveryStatus(input = {}) {
  const status = String(input.status || input.eventType || "").trim().toLowerCase();
  const eventType =
    status === "delivered" || status === "failed" || status === "bounced"
      ? status
      : null;
  if (!eventType) {
    throw new DocumentEngineError(
      DOCUMENT_ENGINE_ERROR.INVALID_DOCUMENT_STATE,
      "Unknown delivery status"
    );
  }
  return observeDocument({
    ...input,
    eventType,
    actorType: input.actorType || DOCUMENT_EVENT_ACTOR.EMAIL_PROVIDER,
    source: input.source || "email_provider",
  });
}
