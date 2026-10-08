/**
 * Purchase Order Service
 *
 *   Draft (editable) → Submit → Pending approval → Approve (commitment) → Receive → Pay (expense)
 *
 * The database owns the money and the workflow: line amounts, header totals, received value, amount
 * paid and due date are computed there; lines and commercial fields freeze once submitted; status moves
 * only along the allowed path (supabase/migrations/20261006120000_* and 20261006140000_*). Checks here
 * give friendlier messages before a round trip; the database is the authority.
 */

import { PurchaseOrder } from '@/api/entities';
import { SendEmail } from '@/api/integrations';
import { supabase } from '@/lib/supabaseClient';
import { getStableSession } from '@/core/auth/SessionCoordinator';
import { ensureUserHasOrganization } from '@/api/auth/ensureUserOrganization';
import {
  fetchPurchaseOrder,
  fetchPurchaseOrderHeaders,
  fetchPurchaseOrderItems,
  listPurchaseOrderEvents,
  listPurchaseOrderPayments,
} from './purchaseOrderQueries';
import { dispatchDocumentEmail } from '@/document-engine/send/email';
import { pdfBlobToBase64 } from '@/document-engine/send/adapter';
import { generatePdfBlobFromElement } from '@/utils/generatePdfFromElement';
import {
  PO_STATUS,
  canApprovePurchaseOrder,
  canCancelPurchaseOrder,
  canRevisePurchaseOrder,
  canSendPurchaseOrder,
  canSubmitPurchaseOrder,
  canReturnToDraft,
  purchaseOrderFinancials,
} from '@shared/procurement/purchaseOrderMath.js';
import {
  buildPurchaseOrderAttachmentEmailHtml,
  buildPurchaseOrderEmailHtml,
  purchaseOrderEmailSubject,
} from '@/components/purchaseOrders/purchaseOrderEmail';

async function resolveOrgIdForCurrentUser() {
  const session = await getStableSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const orgId = await ensureUserHasOrganization(userId);
  if (!orgId) throw new Error('No organization found for this user.');
  return orgId;
}

export {
  fetchPurchaseOrder,
  fetchPurchaseOrderHeaders,
  fetchPurchaseOrderItems,
  listPurchaseOrderEvents,
  listPurchaseOrderPayments,
} from './purchaseOrderQueries';

const LINE_FIELDS = ['product_id', 'description', 'quantity_ordered', 'unit_cost', 'discount_percent', 'vat_rate'];

/**
 * Creates a draft (no `id`) or saves an existing draft: header and lines are replaced together in one
 * transaction (save_purchase_order_draft). Returns the stored row with database-computed totals and
 * due date. Only drafts can be saved.
 */
export const savePurchaseOrderDraft = async ({ id = null, items, ...header } = {}) => {
  const lines = (Array.isArray(items) ? items : [])
    .filter((line) => line?.product_id || String(line?.description || '').trim())
    .map((line) => Object.fromEntries(LINE_FIELDS.map((key) => [key, line[key] ?? null])));
  if (lines.length === 0) throw new Error('Add at least one line to the purchase order.');

  const orgId = id ? null : await resolveOrgIdForCurrentUser();
  const { data, error } = await supabase.rpc('save_purchase_order_draft', {
    p_purchase_order_id: id,
    p_org_id: orgId,
    p_header: {
      supplier_id: header.supplier_id || null,
      order_date: header.order_date || null,
      expected_date: header.expected_date || null,
      currency: header.currency || 'ZAR',
      payment_terms_code: header.payment_terms_code || null,
      due_date: header.payment_terms_code === 'custom' ? header.due_date || null : null,
      delivery_address: header.delivery_address || null,
      delivery_instructions: header.delivery_instructions || null,
      terms: header.terms || null,
      notes: header.notes || null,
      expense_category: header.expense_category || 'inventory',
    },
    p_items: lines,
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

async function setStatus(purchaseOrderId, status, extra = {}) {
  await PurchaseOrder.update(purchaseOrderId, { status, ...extra });
  return fetchPurchaseOrder(purchaseOrderId);
}

export const submitPurchaseOrderForApproval = async (purchaseOrderId) => {
  const po = await fetchPurchaseOrder(purchaseOrderId);
  if (!canSubmitPurchaseOrder(po)) throw new Error('Only drafts can be submitted for approval.');
  if (!po.supplier_id) throw new Error('Choose a supplier before submitting this purchase order.');
  return setStatus(purchaseOrderId, PO_STATUS.PENDING_APPROVAL);
};

/** The reject path: back to an editable draft, with the reason kept in the audit trail. */
export const returnPurchaseOrderToDraft = async (purchaseOrderId, reason = '') => {
  const po = await fetchPurchaseOrder(purchaseOrderId);
  if (!canReturnToDraft(po)) throw new Error('Only purchase orders awaiting approval can go back to draft.');
  const { error } = await supabase.rpc('return_purchase_order_to_draft', {
    p_purchase_order_id: purchaseOrderId,
    p_reason: String(reason || '').trim() || null,
  });
  if (error) throw error;
  return fetchPurchaseOrder(purchaseOrderId);
};

export const approvePurchaseOrder = async (purchaseOrderId) => {
  const po = await fetchPurchaseOrder(purchaseOrderId);
  if (!canApprovePurchaseOrder(po)) {
    throw new Error(
      po.status === PO_STATUS.DRAFT
        ? 'Submit the purchase order for approval first.'
        : 'Only purchase orders awaiting approval can be approved.'
    );
  }
  return setStatus(purchaseOrderId, PO_STATUS.APPROVED);
};

export const cancelPurchaseOrder = async (purchaseOrderId, reason = null) => {
  const po = await fetchPurchaseOrder(purchaseOrderId);
  if (!canCancelPurchaseOrder(po)) {
    throw new Error('A fully received or already cancelled purchase order cannot be cancelled.');
  }
  return setStatus(purchaseOrderId, PO_STATUS.CANCELLED, reason ? { cancellation_reason: reason } : {});
};

/**
 * Controlled change to an approved PO: the original is cancelled ("Revised as PO-1007") and copied into
 * a new linked draft. Refused once anything has been received or paid.
 */
export const revisePurchaseOrder = async (purchaseOrder) => {
  if (!canRevisePurchaseOrder(purchaseOrder)) {
    throw new Error('Only approved purchase orders with nothing received or paid can be revised.');
  }
  const { data, error } = await supabase.rpc('revise_purchase_order', { p_purchase_order_id: purchaseOrder.id });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
};

/**
 * Receives a quantity against one PO line: stock and weighted-average cost for catalog products,
 * received value on the PO, and partially_received / received status. Atomic in the
 * receive_purchase_order_item RPC. `unitCost` values stock only; null uses the line's net price.
 */
export const receivePurchaseOrderItem = async (purchaseOrderItemId, quantityReceived, unitCost = null) => {
  const qty = Math.round(Number(quantityReceived) * 100) / 100;
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Quantity received must be a positive number.');
  }
  let cost = null;
  if (unitCost !== null && unitCost !== '' && unitCost !== undefined) {
    cost = Number(unitCost);
    if (!Number.isFinite(cost) || cost < 0) {
      throw new Error('Unit cost must be a non-negative number.');
    }
  }

  const orgId = await resolveOrgIdForCurrentUser();

  const { data, error } = await supabase.rpc('receive_purchase_order_item', {
    p_po_item_id: purchaseOrderItemId,
    p_org_id: orgId,
    p_quantity_received: qty,
    p_unit_cost: cost,
  });
  if (error) throw error;

  return Array.isArray(data) ? data[0] : data;
};

/**
 * Records a supplier payment against an approved PO. The payment is an expense (source: the PO),
 * so it reaches cash flow and reports on the date paid — approval alone never does.
 */
export const recordPurchaseOrderPayment = async (
  purchaseOrder,
  { amount, paid_on, payment_method, reference, category, notes, client_operation_id } = {}
) => {
  const value = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Enter a payment amount greater than zero.');
  }
  const { owed } = purchaseOrderFinancials(purchaseOrder);
  if (value > owed + 0.001) {
    throw new Error(`This payment is more than the ${owed.toFixed(2)} still owed on ${purchaseOrder.po_number}.`);
  }

  const { data, error } = await supabase.rpc('record_purchase_order_payment', {
    p_purchase_order_id: purchaseOrder.id,
    p_amount: value,
    p_paid_on: paid_on,
    p_payment_method: payment_method,
    p_reference: reference || null,
    p_category: category || null,
    p_notes: notes || null,
    p_client_operation_id: client_operation_id || null,
  });
  if (error) throw error;

  const expense = Array.isArray(data) ? data[0] : data;
  const updated = await fetchPurchaseOrder(purchaseOrder.id);
  return { expense, purchaseOrder: updated };
};

/**
 * Emails the purchase order to the supplier with the PO PDF attached (same Resend transport as invoices)
 * and a short covering summary. If the PDF cannot be generated, sends the full order in the email body
 * instead and reports `attached: false`. A transport failure is an error — the order is never sent
 * silently without its document.
 *
 * @param {{ pdfElement?: HTMLElement | null, idempotencyKey?: string }} args — pdfElement is the rendered
 *   PurchaseOrderDocument; idempotencyKey stops a retried Send from emailing twice.
 */
export const sendPurchaseOrderToSupplier = async ({
  purchaseOrder,
  items,
  supplier,
  business,
  productsById,
  to,
  message,
  pdfElement,
  idempotencyKey,
}) => {
  if (!canSendPurchaseOrder(purchaseOrder)) {
    throw new Error(
      purchaseOrder?.status === PO_STATUS.CANCELLED
        ? 'A cancelled purchase order cannot be sent.'
        : 'Approve the purchase order before sending it to the supplier.'
    );
  }
  const recipient = String(to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Enter a valid supplier email address.');
  }

  const context = { purchaseOrder, items, supplier, business, productsById, message };
  const subject = purchaseOrderEmailSubject(purchaseOrder, business);
  const filename = `${purchaseOrder.po_number}.pdf`;

  let pdfBase64 = null;
  let pdfError = null;
  try {
    if (!pdfElement) throw new Error('Purchase order preview is not ready.');
    // Scale 2 / 0.9 keeps a 60-line, 5-page order around a quarter of the download-quality size,
    // well inside the email function's payload limit, and still crisp when printed.
    const blob = await generatePdfBlobFromElement(pdfElement, filename, { scale: 2, quality: 0.9 });
    pdfBase64 = await pdfBlobToBase64(blob);
    if (!pdfBase64) throw new Error('PDF generation returned no data.');
  } catch (err) {
    pdfError = err;
    console.warn('Purchase order PDF could not be generated; sending the order in the email body.', err);
  }

  let result;
  if (pdfBase64) {
    result = await dispatchDocumentEmail({
      pdfBase64,
      email: recipient,
      subject,
      html: buildPurchaseOrderAttachmentEmailHtml(context),
      filename,
      invoiceNum: purchaseOrder.po_number,
      fromName: business?.name || "Paidly",
      clientName: supplier?.name || "there",
      idempotencyKey,
      kind: "purchase_order",
    });
  } else {
    result = await SendEmail({ to: recipient, subject, body: buildPurchaseOrderEmailHtml(context) });
  }
  if (result?.demo) return { demo: true, attached: Boolean(pdfBase64), purchaseOrder };

  try {
    await PurchaseOrder.update(purchaseOrder.id, { sent_at: new Date().toISOString(), sent_to_email: recipient });
  } catch (err) {
    // The email went out; a failed stamp must not hide that.
    console.warn('Purchase order emailed; could not record sent date:', err);
  }
  return {
    demo: false,
    attached: Boolean(pdfBase64),
    pdfError: pdfError ? String(pdfError.message || pdfError) : null,
    purchaseOrder: await fetchPurchaseOrder(purchaseOrder.id).catch(() => purchaseOrder),
  };
};

export default {
  fetchPurchaseOrderHeaders,
  fetchPurchaseOrderItems,
  listPurchaseOrderEvents,
  fetchPurchaseOrder,
  listPurchaseOrderPayments,
  savePurchaseOrderDraft,
  submitPurchaseOrderForApproval,
  returnPurchaseOrderToDraft,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  revisePurchaseOrder,
  receivePurchaseOrderItem,
  recordPurchaseOrderPayment,
  sendPurchaseOrderToSupplier,
};
