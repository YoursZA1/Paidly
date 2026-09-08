/**
 * Context-aware invoice payment CTAs.
 * Invoice status and payment-intent status are related but not identical.
 */

import {
  INVOICE_STATUS,
  isInvoiceFullyPaid,
  isInvoiceVoidLike,
  normalizeInvoiceStatus,
} from "../commercial/documentStatuses.js";
import {
  PAYMENT_INTENT_STATUS,
  isActivePaymentIntentStatus,
  normalizePaymentIntentStatus,
} from "./paymentIntentStates.js";

export const DOCUMENT_PAYMENT_ACTION = Object.freeze({
  edit: "edit",
  send: "send",
  pay_now: "pay_now",
  remind: "remind",
  retry: "retry",
  view_status: "view_status",
  view_payment: "view_payment",
  download_receipt: "download_receipt",
});

export const DOCUMENT_PAYMENT_BANNER = Object.freeze({
  draft: "draft",
  due: "due",
  overdue: "overdue",
  processing: "processing",
  failed: "failed",
  paid: "paid",
  cancelled: "cancelled",
});

function isOpenReceivable(invoiceStatus) {
  const status = normalizeInvoiceStatus(invoiceStatus);
  return (
    status === INVOICE_STATUS.sent ||
    status === INVOICE_STATUS.viewed ||
    status === INVOICE_STATUS.overdue ||
    status === INVOICE_STATUS.partially_paid
  );
}

/**
 * @param {{
 *   invoiceStatus?: string,
 *   paymentStatus?: string | null,
 *   amountDue?: number,
 *   overdue?: boolean,
 * }} input
 */
export function resolveDocumentPaymentCtas({
  invoiceStatus,
  paymentStatus = null,
  amountDue = 0,
  overdue = false,
} = {}) {
  const invoice = normalizeInvoiceStatus(invoiceStatus);
  const payment = normalizePaymentIntentStatus(paymentStatus);
  const due = Number(amountDue) || 0;

  if (!invoice || invoice === INVOICE_STATUS.draft) {
    return {
      banner: DOCUMENT_PAYMENT_BANNER.draft,
      actions: [DOCUMENT_PAYMENT_ACTION.edit, DOCUMENT_PAYMENT_ACTION.send],
      invoiceStatus: invoice || INVOICE_STATUS.draft,
      paymentStatus: payment,
    };
  }

  if (isInvoiceVoidLike(invoice)) {
    return {
      banner: DOCUMENT_PAYMENT_BANNER.cancelled,
      actions: [],
      invoiceStatus: invoice,
      paymentStatus: payment,
    };
  }

  if (isInvoiceFullyPaid(invoice) || (due <= 0 && payment === PAYMENT_INTENT_STATUS.paid)) {
    return {
      banner: DOCUMENT_PAYMENT_BANNER.paid,
      actions: [DOCUMENT_PAYMENT_ACTION.view_payment, DOCUMENT_PAYMENT_ACTION.download_receipt],
      invoiceStatus: invoice,
      paymentStatus: payment || PAYMENT_INTENT_STATUS.paid,
    };
  }

  if (isActivePaymentIntentStatus(payment)) {
    return {
      banner: DOCUMENT_PAYMENT_BANNER.processing,
      actions: [DOCUMENT_PAYMENT_ACTION.view_status],
      invoiceStatus: invoice,
      paymentStatus: payment,
    };
  }

  if (payment === PAYMENT_INTENT_STATUS.failed) {
    return {
      banner: DOCUMENT_PAYMENT_BANNER.failed,
      actions: [DOCUMENT_PAYMENT_ACTION.retry, DOCUMENT_PAYMENT_ACTION.remind],
      invoiceStatus: invoice,
      paymentStatus: payment,
    };
  }

  if (isOpenReceivable(invoice) || due > 0) {
    return {
      banner: overdue || invoice === INVOICE_STATUS.overdue
        ? DOCUMENT_PAYMENT_BANNER.overdue
        : DOCUMENT_PAYMENT_BANNER.due,
      actions: [DOCUMENT_PAYMENT_ACTION.pay_now, DOCUMENT_PAYMENT_ACTION.remind],
      invoiceStatus: invoice,
      paymentStatus: payment,
    };
  }

  return {
    banner: DOCUMENT_PAYMENT_BANNER.due,
    actions: [],
    invoiceStatus: invoice,
    paymentStatus: payment,
  };
}

export function documentPaymentBannerLabel(banner) {
  switch (banner) {
    case DOCUMENT_PAYMENT_BANNER.draft:
      return "Draft";
    case DOCUMENT_PAYMENT_BANNER.overdue:
      return "Overdue";
    case DOCUMENT_PAYMENT_BANNER.processing:
      return "Payment processing";
    case DOCUMENT_PAYMENT_BANNER.failed:
      return "Payment failed";
    case DOCUMENT_PAYMENT_BANNER.paid:
      return "Paid";
    case DOCUMENT_PAYMENT_BANNER.cancelled:
      return "Cancelled";
    default:
      return "Due";
  }
}
