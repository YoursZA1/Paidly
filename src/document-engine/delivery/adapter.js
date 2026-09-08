import {
  createDocumentContext,
  resolveDocumentDeliveryPath,
  resolveDocumentDeliveryUrl,
} from "@shared/documents/documentEngine.js";

export function resolveDocumentDelivery(contextOrInput, options = {}) {
  const context = contextOrInput?.documentType
    ? contextOrInput
    : createDocumentContext(contextOrInput);
  const path = resolveDocumentDeliveryPath(context, {
    shareToken: options.shareToken || context.record?.public_share_token,
    trackingToken: options.trackingToken,
  });
  const url = resolveDocumentDeliveryUrl(context, {
    origin: options.origin,
    shareToken: options.shareToken || context.record?.public_share_token,
    trackingToken: options.trackingToken,
  });
  return {
    documentType: context.documentType,
    path,
    url,
    secure: context.documentType === "payslip",
    attachPdf: context.documentType !== "payslip",
  };
}

export { resolveDocumentDeliveryPath, resolveDocumentDeliveryUrl };
