/**
 * POS retail metrics from pos_sales_events — same read-model family as cashFlowTruth.
 * Does not invent a second reporting engine or dual-write invoice payments.
 *
 * Cash-flow income (money in): completed sales, minus till_cash refunds only.
 * pending_provider returns restock goods but do not take cash/card money back in V1.
 * Retail net sales still subtract every completed return.
 */

export function posMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function posDayKey(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isCompletedPosEvent(row) {
  if (!row) return false;
  const status = String(row.status || "completed").trim().toLowerCase();
  return status === "completed";
}

export function isPosSaleEvent(row) {
  return isCompletedPosEvent(row) && (row.sale_kind || "sale") !== "return";
}

export function isPosReturnEvent(row) {
  return isCompletedPosEvent(row) && (row.sale_kind || "sale") === "return";
}

export function posPayload(row) {
  const snap = row?.raw_payload && typeof row.raw_payload === "object" && !Array.isArray(row.raw_payload)
    ? row.raw_payload
    : {};
  const total = posMoney(row?.total_amount);
  const discount = posMoney(snap.discount_amount);
  const tax = posMoney(snap.tax_amount);
  const subtotal = snap.subtotal != null ? posMoney(snap.subtotal) : posMoney(Math.abs(total) + discount - tax);
  return { subtotal, discount, tax, total };
}

export function posRefundAffectsCash(row) {
  if (!isPosReturnEvent(row)) return false;
  const rail = String(row.refund_rail || row.raw_payload?.refund_rail || "").trim().toLowerCase();
  if (rail === "till_cash") return true;
  if (rail === "pending_provider" || rail === "provider") return rail === "provider";
  return String(row.payment_method || "").trim().toLowerCase() === "cash";
}

function inPosRange(row, start, end) {
  if (!start || !end) return true;
  const key = posDayKey(row?.occurred_at);
  if (!key) return false;
  const startKey = posDayKey(start);
  const endKey = posDayKey(end);
  return Boolean(startKey && endKey && key >= startKey && key <= endKey);
}

function paymentMethodKey(row) {
  const key = String(row?.payment_method || "").trim().toLowerCase();
  if (key === "cash" || key === "card" || key === "digital") return key;
  return "other";
}

function addProductLine(bucket, item, sign) {
  const id = String(item?.product_id || item?.sku || item?.name || "").trim();
  if (!id) return;
  const qty = Math.abs(Math.trunc(Number(item.quantity) || 0));
  if (qty <= 0) return;
  const unit = posMoney(item.unit_price);
  const prev = bucket.get(id) || { product_id: id, name: item.name || id, units: 0, revenue: 0 };
  prev.units += qty * sign;
  prev.revenue = posMoney(prev.revenue + unit * qty * sign);
  bucket.set(id, prev);
}

/**
 * Map completed till events into cash-flow income rows (positive sales, negative cash refunds).
 */
export function collectPosIncomeEvents(posSales = []) {
  const events = [];
  for (const row of Array.isArray(posSales) ? posSales : []) {
    if (isPosSaleEvent(row)) {
      const amount = posMoney(row.total_amount);
      if (amount <= 0) continue;
      events.push({
        id: `pos-${row.id}`,
        sourceId: row.id,
        kind: "income",
        channel: "pos",
        date: row.occurred_at,
        amount,
        name: row.receipt_number || row.external_id || "POS sale",
        category: `POS ${paymentMethodKey(row)}`,
        vendor: null,
        invoiceId: null,
        payment_method: paymentMethodKey(row),
      });
      continue;
    }
    if (isPosReturnEvent(row) && posRefundAffectsCash(row)) {
      const amount = posMoney(Math.abs(Number(row.total_amount) || 0));
      if (amount <= 0) continue;
      events.push({
        id: `pos-ret-${row.id}`,
        sourceId: row.id,
        kind: "income",
        channel: "pos",
        date: row.occurred_at,
        amount: -amount,
        name: row.receipt_number || row.external_id || "POS refund",
        category: "POS refund",
        vendor: null,
        invoiceId: null,
        payment_method: paymentMethodKey(row),
      });
    }
  }
  return events;
}

/**
 * Retail POS metrics for a calendar-day range (or all events when start/end omitted).
 */
export function summarizePosSales(posSales = [], { start, end } = {}) {
  const rows = (Array.isArray(posSales) ? posSales : []).filter((row) => inPosRange(row, start, end));
  const products = new Map();
  let gross = 0;
  let discounts = 0;
  let tax = 0;
  let posSalesTotal = 0;
  let cashSales = 0;
  let digitalSales = 0;
  let cardSales = 0;
  let otherSales = 0;
  let refunds = 0;
  let cashRefunds = 0;
  let unitsSold = 0;
  let saleCount = 0;
  let returnCount = 0;

  for (const row of rows) {
    if (isPosSaleEvent(row)) {
      const snap = posPayload(row);
      const method = paymentMethodKey(row);
      gross = posMoney(gross + snap.subtotal);
      discounts = posMoney(discounts + snap.discount);
      tax = posMoney(tax + snap.tax);
      posSalesTotal = posMoney(posSalesTotal + snap.total);
      saleCount += 1;
      if (method === "cash") cashSales = posMoney(cashSales + snap.total);
      else if (method === "digital") digitalSales = posMoney(digitalSales + snap.total);
      else if (method === "card") cardSales = posMoney(cardSales + snap.total);
      else otherSales = posMoney(otherSales + snap.total);
      for (const item of Array.isArray(row.items) ? row.items : []) {
        addProductLine(products, item, 1);
        unitsSold += Math.abs(Math.trunc(Number(item.quantity) || 0));
      }
      continue;
    }
    if (isPosReturnEvent(row)) {
      const amount = posMoney(Math.abs(Number(row.total_amount) || 0));
      refunds = posMoney(refunds + amount);
      returnCount += 1;
      if (posRefundAffectsCash(row)) cashRefunds = posMoney(cashRefunds + amount);
      for (const item of Array.isArray(row.items) ? row.items : []) {
        addProductLine(products, item, -1);
        unitsSold -= Math.abs(Math.trunc(Number(item.quantity) || 0));
      }
    }
  }

  const topProducts = Array.from(products.values())
    .sort((a, b) => b.revenue - a.revenue || b.units - a.units)
    .slice(0, 5);

  return {
    sale_count: saleCount,
    return_count: returnCount,
    gross_sales: gross,
    discounts,
    tax,
    pos_sales: posSalesTotal,
    cash_sales: cashSales,
    digital_sales: digitalSales,
    card_sales: cardSales,
    other_sales: otherSales,
    refunds,
    cash_refunds: cashRefunds,
    net_sales: posMoney(posSalesTotal - refunds),
    units_sold: unitsSold,
    top_products: topProducts,
  };
}
