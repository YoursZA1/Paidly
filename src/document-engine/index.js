/**
 * Document Engine — public entry
 * @see ./documentTypes.js
 */
export {
    DOCUMENT_TYPES,
    DOCUMENT_TYPE_LIST,
    isDocumentType,
    normalizeDocumentType,
    parseRouteDocumentTypeStrict,
    getDocumentEntity,
    documentRef,
} from "./documentTypes";
export {
    INVOICE_STATUSES,
    QUOTE_STATUSES,
    PAYSLIP_STATUSES,
    canTransitionStatus,
    assertTransition,
    allowedNextStatuses,
} from "./documentStateMachine";
export { aggregateFromItems, normalizeLineTotals } from "./documentTotals";
export { formatDocumentEventType, summarizeDocumentEventPayload } from "./documentEventLabels";
export { documentStatusBadgeVariant, documentTypeBadgeVariant } from "./documentUi";
export { DOCUMENT_EVENT_TYPES, resolveLifecycleEventType } from "./documentEventTypes";
