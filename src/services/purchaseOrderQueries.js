/**
 * Purchase order reads (no workflow, PDF or email code), so Cash Flow, Dashboard and Reports can import
 * them without pulling the send pipeline into their bundles. RLS authorizes; the active-org filter picks
 * the business (src/api/auth/sessionActiveOrg.js).
 */
import { supabase } from '@/lib/supabaseClient';
import { getSelectColumns } from '@/api/entity/entityShared';
import { resolveSessionActiveOrgId } from '@/api/auth/sessionActiveOrg';

/** Fresh row from the database (totals, due date and status are set by triggers). */
export async function fetchPurchaseOrder(purchaseOrderId) {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select(getSelectColumns('purchase_orders'))
    .eq('id', purchaseOrderId)
    .single();
  if (error) throw error;
  return data;
}

const HEADER_PAGE = 1000; // PostgREST max_rows: larger reads are silently truncated, so page explicitly.

/**
 * Every purchase order header of the active business, newest first, each with `line_count`.
 * Paged past PostgREST's row cap; lines are not loaded here (see fetchPurchaseOrderItems).
 * @param {{ statuses?: string[] }} [options] — limit to these statuses (e.g. open orders for Cash Flow)
 */
export async function fetchPurchaseOrderHeaders({ statuses } = {}) {
  const orgId = await resolveSessionActiveOrgId();
  const columns = `${getSelectColumns('purchase_orders')}, purchase_order_items(count)`;
  const rows = [];
  for (let from = 0; ; from += HEADER_PAGE) {
    let query = supabase
      .from('purchase_orders')
      .select(columns)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + HEADER_PAGE - 1);
    if (orgId) query = query.eq('org_id', orgId);
    if (Array.isArray(statuses) && statuses.length) query = query.in('status', statuses);
    const { data, error } = await query;
    if (error) throw error;
    for (const row of data || []) {
      const { purchase_order_items: embedded, ...header } = row;
      rows.push({ ...header, line_count: Number(embedded?.[0]?.count ?? 0) });
    }
    if (!data || data.length < HEADER_PAGE) break;
  }
  return rows;
}

/** Lines of one purchase order, in document order. */
export async function fetchPurchaseOrderItems(purchaseOrderId) {
  const { data, error } = await supabase
    .from('purchase_order_items')
    .select(getSelectColumns('purchase_order_items'))
    .eq('purchase_order_id', purchaseOrderId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Audit trail of one purchase order (purchase_order_events), oldest first. */
export async function listPurchaseOrderEvents(purchaseOrderId) {
  const { data, error } = await supabase
    .from('purchase_order_events')
    .select('id, action, actor_id, from_status, to_status, metadata, created_at')
    .eq('purchase_order_id', purchaseOrderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Supplier payments (expenses) recorded against one PO, oldest first. */
export async function listPurchaseOrderPayments(purchaseOrderId) {
  const { data, error } = await supabase
    .from('expenses')
    .select('id, expense_number, amount, vat, date, payment_method, payment_reference, category, notes, created_at')
    .eq('purchase_order_id', purchaseOrderId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}


/**
 * Supplier payments (PO-linked expenses) dated within [start, end] for the active business.
 * Paged past PostgREST's row cap; returns { amount, date, purchase_order_id } rows.
 */
export async function fetchSupplierPaymentsBetween(start, end) {
  const orgId = await resolveSessionActiveOrgId();
  const rows = [];
  for (let from = 0; ; from += HEADER_PAGE) {
    let query = supabase
      .from('expenses')
      .select('id, amount, date, purchase_order_id')
      .not('purchase_order_id', 'is', null)
      .gte('date', start)
      .lte('date', end)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + HEADER_PAGE - 1);
    if (orgId) query = query.eq('org_id', orgId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < HEADER_PAGE) break;
  }
  return rows;
}
