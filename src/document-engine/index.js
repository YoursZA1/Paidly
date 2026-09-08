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
export {
    aggregateFromItems,
    normalizeLineTotals,
    toCommercialItemRow,
    commercialItemsForPersist,
    isLegacyDiscountLine,
    roundMoney,
} from "./documentTotals";
export {
    allocateDocumentNumber,
    resolveDocumentNumberAllocation,
    documentNumberConflictMessage,
    isUniqueViolation,
    isDocumentNumberUniqueViolation,
    isSourceQuoteUniqueViolation,
} from "./allocateDocumentNumber";
export {
    convertQuoteToInvoice,
    canConvertQuoteStatus,
    assertQuoteConvertible,
    findInvoiceBySourceQuoteId,
    mapQuoteItemsForInvoice,
    quoteConvertComposeUrl,
    CONVERTIBLE_QUOTE_STATUSES,
} from "./convertQuoteToInvoice";
export { formatDocumentEventType, summarizeDocumentEventPayload } from "./documentEventLabels";
export { documentStatusBadgeVariant, documentTypeBadgeVariant } from "./documentUi";
export { DOCUMENT_EVENT_TYPES, resolveLifecycleEventType } from "./documentEventTypes";
export {
    DOCUMENT_CATEGORIES,
    DOCUMENT_TYPE_DEFS,
    DOCUMENT_TYPE_KEYS,
    HUB_DOCUMENT_TYPE_DEFS,
    STATUS_FLOWS,
    isCatalogType,
    getTypeDef,
    getCategoryDef,
    typeLabel,
    categoryForType,
    isFinancialType,
    isHubPersistedType,
    typesByCategory,
    hubTypesByCategory,
    defaultStatusForCatalogType,
    allowedStatusesForType,
} from "./documentCatalog";
export {
    GENERIC_DOCUMENT_TABLE,
    COMMERCIAL_DOCUMENT_TABLES,
    COMMERCIAL_DOCUMENT_TYPES,
    DOCUMENTS_HUB_EXCLUDED_TYPES,
    isCommercialDocumentType,
    isDocumentsHubExcludedType,
    tableForDocumentType,
    assertHubWritableType,
    hubWriteForbiddenMessage,
    leftoverHubCommercialMessage,
    postgrestExcludeCommercialHubTypes,
} from "./documentSystemOfRecord";
export {
    DOCUMENT_CONVERSIONS,
    getConversionOptions,
    isCommercialConversion,
    specialisedComposeUrl,
    hubDocumentToComposePrefill,
    usesLegacyQuoteToInvoice,
} from "./documentConversions";
export {
    DOCUMENT_CREATE_FLOW,
    DEDICATED_CREATE_PAGES,
    resolveDocumentCreateFlow,
    getDedicatedCreatePath,
    usesDedicatedCreatePage,
    dedicatedCreateTitle,
    specialisedListPath,
} from "./documentCreateFlow";
export {
    documentsReturnPath,
    isApprovalFlowType,
    persistNewHubDocument,
    afterCreateNavigateTarget,
} from "./documentCreateNavigation";
export {
    LEAVE_TYPES,
    DEFAULT_LEAVE_BALANCES,
    leaveTypeLabel,
    leaveBalanceForType,
    countBusinessLeaveDays,
} from "./leaveRequest";
export {
    EXPENSE_CATEGORIES,
    REIMBURSEMENT_METHODS,
    emptyExpenseLine,
    expenseCategoryLabel,
    reimbursementMethodLabel,
    sumExpenseLineAmounts,
    expenseLinesToDocumentItems,
} from "./expenseClaim";
export {
    DOCUMENT_TEMPLATE_PRESETS,
    getTemplatePreset,
    presetsByCategory,
} from "./documentTemplatePresets";
export {
    getDocumentFormProfile,
    hasDocumentFormProfile,
    typedDocumentTitle,
    emptyFormValues,
    formValuesFromMetadata,
    buildDocumentTitleFromForm,
    formMetadataFromValues,
    resolveFormState,
    validateFormValues,
    TYPED_DOCUMENT_EXCLUDED,
} from "./documentFormProfiles";
export {
    RATING_SCALE,
    PERFORMANCE_COMPETENCIES,
    DEFAULT_CHECKLIST_STARTER_LABELS,
    parseChecklistField,
    serializeChecklistField,
    parseRatingMatrixField,
    ratingLabel,
    checklistProgress,
} from "./documentFormRichFields";

export {
    DOCUMENT_ENGINE_ERROR,
    DocumentEngineError,
} from "./core/documentErrors";
export {
    DOCUMENT_ENGINE_TYPES,
    DOCUMENT_ENGINE_CHANNELS,
    DOCUMENT_OBSERVE_ACTION,
    createDocumentContext,
} from "./core/documentContext";
export { generateDocumentPdf, generatePayslipPDF } from "./pdf/adapter";
export { sendDocument } from "./send/adapter";
export { dispatchDocumentEmail, dispatchInvoiceEmailViaCanonicalPath } from "./send/email";
export { resolveDocumentDelivery } from "./delivery/adapter";
export {
    observeDocument,
    observeDocumentOpened,
    observeDocumentClicked,
    observeDocumentDownloaded,
    observeDeliveryStatus,
} from "./observe/adapter";

/** @deprecated Prefer {@link generateDocumentPdf} */
export { generateDocumentPdf as generateDocument };
/** @deprecated Prefer {@link generateDocumentPdf} */
export { generateDocumentPdf as getDocumentArtifact };
