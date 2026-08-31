/** Pure return / refund helpers — unit-tested, no I/O.
 *
 * Sale SoR stays pos_sales_events. A return is a new row (sale_kind = return,
 * parent_event_id = original). The original sale is never deleted or rewritten.
 */

import {
  remainingReturnQuantities,
  roundMoney,
  normalizePaymentMethod,
} from "./posCheckoutMath.js";

export const POS_REFUND_STATUSES = Object.freeze(["none", "partial", "full"]);
export const POS_REFUND_RAILS = Object.freeze(["till_cash", "pending_provider", "provider"]);

export function saleLineKey(item) {
  return String(item?.product_id || item?.sku || "").trim();
}

export function withSaleLineIds(lines) {
  return (Array.isArray(lines) ? lines : []).map((line, index) => ({
    ...line,
    line_id: line?.line_id || `line-${index + 1}-${saleLineKey(line) || index + 1}`,
  }));
}

export function isCountableReturnEvent(row) {
  if (!row) return false;
  if ((row.sale_kind || "") !== "return") return false;
  if (row.status && row.status !== "completed") return false;
  return true;
}

/**
 * Cash leaves the drawer now. Card / digital restock goods but do not call
 * Ozow or a card terminal — that rail is pending_provider until a later
 * payment_intents row with refund_of_intent_id exists (refund_rail = provider).
 *
 * refund_as_cash: manager can take cash from the drawer for a card/digital sale.
 */
export function refundRailForSale(originalPaymentMethod, { refundAsCash = false } = {}) {
  if (refundAsCash) return "till_cash";
  const method = normalizePaymentMethod(originalPaymentMethod) || "cash";
  return method === "cash" ? "till_cash" : "pending_provider";
}

export function paymentMethodForRefundRail(rail, originalPaymentMethod) {
  if (rail === "till_cash") return "cash";
  return normalizePaymentMethod(originalPaymentMethod) || "card";
}

export function flattenReturnItems(returnEvents) {
  const items = [];
  for (const row of returnEvents || []) {
    if (!isCountableReturnEvent(row)) continue;
    if (Array.isArray(row.items)) items.push(...row.items);
  }
  return items;
}

export function summarizeSaleRefunds(original, returnEvents) {
  const originalItems = Array.isArray(original?.items) ? original.items : [];
  const countable = (returnEvents || []).filter(isCountableReturnEvent);
  const remaining = remainingReturnQuantities(originalItems, flattenReturnItems(countable));

  let soldQty = 0;
  let remainingQty = 0;
  for (const item of originalItems) {
    const key = saleLineKey(item);
    if (!key) continue;
    const sold = Math.abs(Math.trunc(Number(item.quantity) || 0));
    soldQty += sold;
    remainingQty += Math.max(0, remaining.get(key) || 0);
  }

  const refundedAmount = roundMoney(
    countable.reduce((sum, row) => sum + Math.abs(Number(row.total_amount) || 0), 0)
  );

  let refund_status = "none";
  if (soldQty > 0 && remainingQty <= 0) refund_status = "full";
  else if (remainingQty < soldQty) refund_status = "partial";

  return {
    refund_status,
    refunded_amount: refundedAmount,
    sold_qty: soldQty,
    remaining_qty: remainingQty,
    remaining,
  };
}

/**
 * Build requested return lines against remaining qty.
 * Omitting `requested` returns every remaining unit (full remaining return).
 */
export function allocateReturnLines(originalItems, returnEvents, requested) {
  const remaining = remainingReturnQuantities(
    originalItems || [],
    flattenReturnItems(returnEvents)
  );
  const originalById = new Map();
  for (const item of originalItems || []) {
    const key = saleLineKey(item);
    if (key) originalById.set(key, item);
  }

  const source = Array.isArray(requested) && requested.length > 0
    ? requested
    : (originalItems || []).map((item) => ({
        product_id: item.product_id,
        line_id: item.line_id,
        quantity: remaining.get(saleLineKey(item)) || 0,
      }));

  const lines = [];
  for (const raw of source) {
    const key = saleLineKey(raw);
    const qty = Math.trunc(Number(raw.quantity) || 0);
    if (!key || qty <= 0) continue;
    const left = remaining.get(key) || 0;
    if (qty > left) {
      return { ok: false, error: "Cannot return more than sold for this item", code: "RETURN_QTY" };
    }
    const orig = originalById.get(key);
    if (!orig) {
      return { ok: false, error: "Return item is not on the original sale", code: "RETURN_ITEM" };
    }
    remaining.set(key, left - qty);
    lines.push({
      product_id: orig.product_id,
      line_id: orig.line_id || raw.line_id || null,
      quantity: qty,
      unit_price: orig.unit_price,
    });
  }

  if (lines.length === 0) {
    return { ok: false, error: "This sale has already been fully returned", code: "RETURN_COMPLETE" };
  }
  return { ok: true, lines };
}

export function remainingLinesForTill(original, returnEvents) {
  const remaining = remainingReturnQuantities(
    original?.items || [],
    flattenReturnItems(returnEvents)
  );
  return (original?.items || [])
    .map((item) => {
      const key = saleLineKey(item);
      const left = remaining.get(key) || 0;
      return {
        product_id: item.product_id,
        line_id: item.line_id || null,
        name: item.name || "Item",
        unit_price: Number(item.unit_price) || 0,
        sold_quantity: Math.abs(Math.trunc(Number(item.quantity) || 0)),
        remaining: left,
      };
    })
    .filter((line) => line.remaining > 0);
}

export function attachRefundStateToSales(sales) {
  const list = Array.isArray(sales) ? sales : [];
  const childrenByParent = new Map();
  for (const row of list) {
    if (!isCountableReturnEvent(row) || !row.parent_event_id) continue;
    const bucket = childrenByParent.get(row.parent_event_id) || [];
    bucket.push(row);
    childrenByParent.set(row.parent_event_id, bucket);
  }
  return list.map((row) => {
    if ((row.sale_kind || "sale") !== "sale") return row;
    const summary = summarizeSaleRefunds(row, childrenByParent.get(row.id) || []);
    const stored = row.refund_status && POS_REFUND_STATUSES.includes(row.refund_status)
      ? row.refund_status
      : null;
    return {
      ...row,
      refund_status: stored || summary.refund_status,
      refunded_amount: row.refunded_amount != null
        ? roundMoney(row.refunded_amount)
        : summary.refunded_amount,
    };
  });
}
