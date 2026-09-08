/**
 * Document Observe rules used by the engine adapters.
 */
export {
  DOCUMENT_EVENT_SOURCE,
  DOCUMENT_EVENT_TYPE,
  DOCUMENT_EVENT_ACTOR,
  PAYSLIP_EVENT_TYPES,
  QUOTE_EVENT_TYPES,
  INVOICE_EVENT_TYPES,
  isEventAllowedForSource,
  assertEventAllowedForSource,
  documentEventSourceFromType,
  buildDocumentEventIdempotencyKey,
} from "@shared/documents/documentEvents.js";
