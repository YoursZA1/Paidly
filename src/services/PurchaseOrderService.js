/**
 * Purchase Order Service
 * Draft -> Approved -> Received lifecycle guards, mirroring the status-guard
 * convention used for invoices in InvoiceSendService.js (checked in the app
 * layer, not enforced by DB triggers).
 */

import { PurchaseOrder, PurchaseOrderItem } from '@/api/entities';
import { supabase } from '@/lib/supabaseClient';
import { getStableSession } from '@/core/auth/SessionCoordinator';
import { ensureUserHasOrganization } from '@/api/auth/ensureUserOrganization';

async function resolveOrgIdForCurrentUser() {
  const session = await getStableSession();
  const userId = session?.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const orgId = await ensureUserHasOrganization(userId);
  if (!orgId) throw new Error('No organization found for this user.');
  return orgId;
}

/**
 * Allocates the next PO-NNNN number for the current org and creates the
 * purchase order (with line items, via PurchaseOrder.create's data.items handling).
 */
export const createPurchaseOrder = async ({ supplier_id, expected_date, notes, items } = {}) => {
  const orgId = await resolveOrgIdForCurrentUser();

  const { data: poNumber, error: numberErr } = await supabase.rpc('next_document_number', {
    p_org_id: orgId,
    p_doc_type: 'purchase_order',
    p_prefix: 'PO',
  });
  if (numberErr) throw numberErr;

  return PurchaseOrder.create({
    org_id: orgId,
    supplier_id: supplier_id || null,
    po_number: poNumber,
    status: 'draft',
    expected_date: expected_date || null,
    notes: notes || null,
    items: items || [],
  });
};

export const approvePurchaseOrder = async (purchaseOrderId) => {
  const po = await PurchaseOrder.get(purchaseOrderId);
  if (po.status !== 'draft') {
    throw new Error('Only draft purchase orders can be approved.');
  }
  return PurchaseOrder.update(purchaseOrderId, { status: 'approved' });
};

export const cancelPurchaseOrder = async (purchaseOrderId) => {
  const po = await PurchaseOrder.get(purchaseOrderId);
  if (po.status === 'received') {
    throw new Error('A fully received purchase order cannot be cancelled.');
  }
  return PurchaseOrder.update(purchaseOrderId, { status: 'cancelled' });
};

/**
 * Receives a quantity against one PO line: updates weighted-average cost,
 * increases stock via the shared inventory ledger, and flips the PO to
 * 'received' once every line is fully received. Delegates the atomic work
 * to the receive_purchase_order_item RPC (supabase/migrations/20260804133000_*).
 */
export const receivePurchaseOrderItem = async (purchaseOrderItemId, quantityReceived, unitCost) => {
  const qty = Number(quantityReceived);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Quantity received must be a positive number.');
  }
  const cost = Number(unitCost);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new Error('Unit cost must be a non-negative number.');
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

/** Adds a line item to a PO still in draft. */
export const addPurchaseOrderItem = async (purchaseOrderId, { product_id, quantity_ordered, unit_cost }) => {
  const po = await PurchaseOrder.get(purchaseOrderId);
  if (po.status !== 'draft') {
    throw new Error('Line items can only be added while the purchase order is a draft.');
  }
  return PurchaseOrderItem.create({
    org_id: po.org_id,
    purchase_order_id: purchaseOrderId,
    product_id,
    quantity_ordered,
    unit_cost,
  });
};

/** Removes a line item from a PO still in draft. */
export const removePurchaseOrderItem = async (purchaseOrderItemId) => {
  const item = await PurchaseOrderItem.get(purchaseOrderItemId);
  const po = await PurchaseOrder.get(item.purchase_order_id);
  if (po.status !== 'draft') {
    throw new Error('Line items can only be removed while the purchase order is a draft.');
  }
  return PurchaseOrderItem.delete(purchaseOrderItemId);
};

export default {
  createPurchaseOrder,
  approvePurchaseOrder,
  cancelPurchaseOrder,
  receivePurchaseOrderItem,
  addPurchaseOrderItem,
  removePurchaseOrderItem,
};
