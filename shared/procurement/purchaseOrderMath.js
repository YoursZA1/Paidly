/**
 * Purchase order money — the same arithmetic the database runs
 * (purchase_order_line_amounts in supabase/migrations/20261006120000_purchase_order_financials.sql).
 *
 *   Invoice        = money coming in
 *   Purchase order = money the business has committed to spend (approved, not yet an expense)
 *   Expense        = money actually spent (a supplier payment recorded against the PO)
 *
 * Three financial states for an approved PO (they always add up to its committed value):
 *   Committed  approved, not yet received (net of any deposit paid)
 *   Payable    received, unpaid — a supplier liability
 *   Paid       supplier payments recorded (expenses)
 *
 * Line: gross = round(qty × unit_cost, 2); discount = round(gross × discount% / 100, 2);
 *       net = gross − discount; vat = round(net × vat% / 100, 2); total = net + vat.
 * Rounding is half away from zero on whole cents, like Postgres numeric round().
 */

export const PO_STATUS = Object.freeze({
  DRAFT: "draft",
  PENDING_APPROVAL: "pending_approval",
  APPROVED: "approved",
  PARTIALLY_RECEIVED: "partially_received",
  RECEIVED: "received",
  CANCELLED: "cancelled",
});

export const PO_STATUS_LABEL = Object.freeze({
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
});

export const PO_PAYMENT_STATUS_LABEL = Object.freeze({
  none: "Not committed",
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
});

/** Categories a supplier payment can be booked under (keys match the expense form). */
export const PO_EXPENSE_CATEGORIES = Object.freeze([
  { value: "inventory", label: "Inventory / Stock" },
  { value: "supplies", label: "Supplies" },
  { value: "equipment", label: "Equipment" },
  { value: "maintenance", label: "Maintenance" },
  { value: "software", label: "Software" },
  { value: "consulting", label: "Services / Consulting" },
  { value: "marketing", label: "Marketing" },
  { value: "office", label: "Office" },
  { value: "other", label: "Other" },
]);

/**
 * Business payment methods — the same values the expense form records (ExpenseForm payment_method), so
 * supplier payments sort and report alongside every other expense. record_purchase_order_payment accepts
 * these (plus legacy "card").
 */
export const PO_PAYMENT_METHODS = Object.freeze([
  { value: "eft", label: "EFT" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "credit_card", label: "Credit card" },
  { value: "debit_card", label: "Debit card" },
  { value: "check", label: "Cheque" },
  { value: "other", label: "Other" },
]);

export const DEFAULT_PO_VAT_RATE = 15;

/** Payment terms (purchase_orders.payment_terms_code). `days` null = not a fixed offset. */
export const PO_PAYMENT_TERMS = Object.freeze([
  { value: "due_on_receipt", label: "Due on receipt", days: null },
  { value: "net_7", label: "7 days", days: 7 },
  { value: "net_15", label: "15 days", days: 15 },
  { value: "net_30", label: "30 days", days: 30 },
  { value: "custom", label: "Custom date", days: null },
]);
export const DEFAULT_PO_PAYMENT_TERMS = "net_30";

/** Best match for a supplier's free-text terms ("30 days", "COD"), else the default. */
export function paymentTermsCodeFromText(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return DEFAULT_PO_PAYMENT_TERMS;
  if (/^(cod|due on receipt|on receipt|cash on delivery)\b/.test(t)) return "due_on_receipt";
  const m = /^(\d+)\s*days?/.exec(t);
  if (m && ["7", "15", "30"].includes(m[1])) return `net_${m[1]}`;
  return DEFAULT_PO_PAYMENT_TERMS;
}

/** yyyy-MM-dd + n days, in calendar days (no time zone drift). */
function addIsoDays(iso, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/**
 * Due date the database will store (public.purchase_order_due_date): order date + N days; due on
 * receipt = expected delivery (then the actual first receipt date); custom = the date entered.
 */
export function purchaseOrderDueDate({ code, orderDate, expectedDate, customDueDate } = {}) {
  const term = PO_PAYMENT_TERMS.find((t) => t.value === code);
  if (term?.days != null) return addIsoDays(orderDate, term.days);
  if (code === "due_on_receipt") {
    const date = expectedDate || orderDate;
    return date ? String(date).slice(0, 10) : null;
  }
  return customDueDate ? String(customDueDate).slice(0, 10) : null;
}

/** yyyy-MM-dd from an ISO string or a Date (calendar date as the caller sees it, no UTC shift). */
function isoDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(value));
  return m ? m[1] : null;
}

const todayIso = (now = new Date()) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

function daysBetweenIso(fromIso, toIso) {
  const a = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toIso).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}

const COMMITTED = new Set([PO_STATUS.APPROVED, PO_STATUS.PARTIALLY_RECEIVED, PO_STATUS.RECEIVED]);

/**
 * Value in whole hundredths, rounded half away from zero like a numeric(12,2) column stores it.
 * Shifts the decimal text ("1.005e2" = 100.5) so 1.005 becomes 101, not 100 (1.005 × 100 = 100.4999…).
 */
function hundredths(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  const abs = Math.abs(n);
  const text = String(abs);
  const shifted = text.includes("e") ? abs * 100 : Number(`${text}e2`);
  return Math.sign(n) * Math.round(shifted);
}

/** Integer division rounded half away from zero. */
function divRound(numerator, denominator) {
  if (numerator === 0) return 0;
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) * 2 + denominator) / (denominator * 2));
}

const toRand = (cents) => cents / 100;

function lineCents(quantity, unitCost, discountPercent, vatRate) {
  const gross = divRound(hundredths(quantity) * hundredths(unitCost), 100);
  const discount = divRound(gross * hundredths(discountPercent), 10000);
  const net = gross - discount;
  const vat = divRound(net * hundredths(vatRate), 10000);
  return { gross, discount, net, vat, total: net + vat };
}

function centsToRand(c) {
  return { gross: toRand(c.gross), discount: toRand(c.discount), net: toRand(c.net), vat: toRand(c.vat), total: toRand(c.total) };
}

/** Amounts for one line at the ordered quantity. */
export function purchaseOrderLineAmounts(line = {}) {
  return centsToRand(
    lineCents(line.quantity_ordered ?? line.quantity, line.unit_cost, line.discount_percent, line.vat_rate)
  );
}

/** Amounts for what has been received on one line. */
export function purchaseOrderLineReceivedAmounts(line = {}) {
  return centsToRand(lineCents(line.quantity_received, line.unit_cost, line.discount_percent, line.vat_rate));
}

/** Subtotal (before discount), discount, VAT and grand total for a set of lines. */
export function purchaseOrderTotals(lines = []) {
  const sum = { gross: 0, discount: 0, vat: 0, total: 0 };
  for (const line of Array.isArray(lines) ? lines : []) {
    const c = lineCents(line.quantity_ordered ?? line.quantity, line.unit_cost, line.discount_percent, line.vat_rate);
    sum.gross += c.gross;
    sum.discount += c.discount;
    sum.vat += c.vat;
    sum.total += c.total;
  }
  return {
    subtotal: toRand(sum.gross),
    discountTotal: toRand(sum.discount),
    vatTotal: toRand(sum.vat),
    total: toRand(sum.total),
  };
}

/**
 * Where one PO stands financially.
 *   committed        what the business is on the hook for (0 before approval; received value once cancelled)
 *   committedOpen    Committed state: approved, not yet received, net of deposits (= owed − payable)
 *   payableNow       Payable state: received − paid (supplier liability for goods in hand)
 *   paid             Paid state: supplier payments recorded as expenses
 *   owed             committed − paid (outstanding amount, Committed + Payable)
 *   awaitingDelivery committed value not yet received
 */
export function purchaseOrderFinancials(po = {}, { now = new Date() } = {}) {
  const status = String(po.status || PO_STATUS.DRAFT);
  const total = hundredths(po.total_amount);
  const received = hundredths(po.received_amount);
  const paid = hundredths(po.amount_paid);

  const committed = COMMITTED.has(status) ? total : status === PO_STATUS.CANCELLED ? received : 0;
  const awaitingDelivery = COMMITTED.has(status) ? Math.max(0, total - received) : 0;
  const owed = Math.max(0, committed - paid);
  const payableNow = Math.max(0, Math.min(received, committed) - paid);
  const committedOpen = Math.max(0, owed - payableNow);
  const released = status === PO_STATUS.CANCELLED ? Math.max(0, total - received) : 0;

  let paymentStatus = "none";
  if (committed > 0) paymentStatus = paid <= 0 ? "unpaid" : paid >= committed ? "paid" : "partially_paid";

  const dueDate = isoDateOnly(po.due_date);
  const daysUntilDue = dueDate && owed > 0 ? daysBetweenIso(todayIso(now), dueDate) : null;

  return {
    status,
    total: toRand(total),
    committed: toRand(committed),
    committedOpen: toRand(committedOpen),
    received: toRand(received),
    paid: toRand(paid),
    awaitingDelivery: toRand(awaitingDelivery),
    owed: toRand(owed),
    payableNow: toRand(payableNow),
    released: toRand(released),
    paymentStatus,
    dueDate,
    daysUntilDue,
    isOverdue: daysUntilDue != null && daysUntilDue < 0,
  };
}

export const PO_FINANCIAL_STATUS_LABEL = Object.freeze({
  not_committed: "Not committed",
  committed: "Committed",
  received: "Received · unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
});

/**
 * Where the money stands, independent of the procurement status:
 *   not_committed  draft / pending approval
 *   committed      approved, nothing received, nothing paid
 *   received       goods received (any amount), nothing paid — a supplier payable
 *   partially_paid some paid, balance outstanding
 *   paid           nothing outstanding on a committed order
 *   cancelled      cancelled with nothing owed (a cancelled order with received, unpaid goods stays owed)
 */
export function purchaseOrderFinancialStatus(po = {}) {
  const f = purchaseOrderFinancials(po);
  if (f.status === PO_STATUS.CANCELLED && f.owed <= 0) return f.paid > 0 ? "paid" : "cancelled";
  if (f.committed <= 0) return "not_committed";
  if (f.owed <= 0) return "paid";
  if (f.paid > 0) return "partially_paid";
  return f.received > 0 ? "received" : "committed";
}

/**
 * Expected supplier payments: one outflow per PO still owing money, on its due date. Overdue
 * balances are expected now (today). Undated balances are listed with date null.
 */
export function purchaseOrderPaymentSchedule(purchaseOrders = [], { now = new Date(), suppliersById = null } = {}) {
  const today = todayIso(now);
  const out = [];
  for (const po of Array.isArray(purchaseOrders) ? purchaseOrders : []) {
    const f = purchaseOrderFinancials(po, { now });
    if (f.owed <= 0) continue;
    const supplierName = suppliersById?.get?.(po.supplier_id)?.name || "";
    out.push({
      id: `po-${po.id}`,
      purchaseOrderId: po.id,
      poNumber: po.po_number,
      supplierName,
      dueDate: f.dueDate,
      date: f.dueDate ? (f.isOverdue ? today : f.dueDate) : null,
      amount: f.owed,
      payable: f.payableNow,
      overdue: f.isOverdue,
    });
  }
  return out.sort((a, b) => String(a.date || "9999").localeCompare(String(b.date || "9999")));
}

/** Sum of scheduled supplier payments from today through `windowDays` (overdue counted as today). */
export function supplierOutflowWithin(schedule = [], { now = new Date(), windowDays = 30 } = {}) {
  const start = todayIso(now);
  const end = addIsoDays(start, windowDays);
  let cents = 0;
  for (const row of schedule) {
    if (row.date && row.date >= start && row.date <= end) cents += hundredths(row.amount);
  }
  return toRand(cents);
}

/** Totals for the Purchase Orders page and Cash Flow. */
export function summarizePurchaseOrders(purchaseOrders = [], { now = new Date() } = {}) {
  const s = {
    committed: 0,
    committedOpen: 0,
    received: 0,
    awaitingDelivery: 0,
    paid: 0,
    owed: 0,
    payableNow: 0,
    overdue: 0,
    overdueCount: 0,
    dueNext30: 0,
    cancelled: 0,
    cancelledCount: 0,
    draftCount: 0,
    draftValue: 0,
    pendingApprovalCount: 0,
    pendingApprovalValue: 0,
    openCount: 0,
  };
  for (const po of Array.isArray(purchaseOrders) ? purchaseOrders : []) {
    const f = purchaseOrderFinancials(po, { now });
    s.committed += hundredths(f.committed);
    s.committedOpen += hundredths(f.committedOpen);
    s.received += hundredths(f.received);
    s.awaitingDelivery += hundredths(f.awaitingDelivery);
    s.paid += hundredths(f.paid);
    s.owed += hundredths(f.owed);
    s.payableNow += hundredths(f.payableNow);
    if (f.isOverdue) {
      s.overdue += hundredths(f.owed);
      s.overdueCount += 1;
    }
    if (f.owed > 0 && f.daysUntilDue != null && f.daysUntilDue <= 30) s.dueNext30 += hundredths(f.owed);
    if (f.status === PO_STATUS.CANCELLED) {
      s.cancelled += hundredths(f.released);
      s.cancelledCount += 1;
    } else if (f.status === PO_STATUS.DRAFT) {
      s.draftCount += 1;
      s.draftValue += hundredths(f.total);
    } else if (f.status === PO_STATUS.PENDING_APPROVAL) {
      s.pendingApprovalCount += 1;
      s.pendingApprovalValue += hundredths(f.total);
    }
    if (f.owed > 0 || f.awaitingDelivery > 0) s.openCount += 1;
  }
  for (const key of [
    "committed", "committedOpen", "received", "awaitingDelivery", "paid", "owed", "payableNow",
    "overdue", "dueNext30", "cancelled", "draftValue", "pendingApprovalValue",
  ]) {
    s[key] = toRand(s[key]);
  }
  return s;
}

export const canEditPurchaseOrder = (po) => po?.status === PO_STATUS.DRAFT;
export const canSubmitPurchaseOrder = (po) => po?.status === PO_STATUS.DRAFT;
export const canApprovePurchaseOrder = (po) => po?.status === PO_STATUS.PENDING_APPROVAL;
export const canReturnToDraft = (po) => po?.status === PO_STATUS.PENDING_APPROVAL;
export const canRevisePurchaseOrder = (po) =>
  po?.status === PO_STATUS.APPROVED && hundredths(po.received_amount) === 0 && hundredths(po.amount_paid) === 0;
export const canReceivePurchaseOrder = (po) =>
  po?.status === PO_STATUS.APPROVED || po?.status === PO_STATUS.PARTIALLY_RECEIVED;
export const canCancelPurchaseOrder = (po) =>
  [PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED, PO_STATUS.PARTIALLY_RECEIVED].includes(po?.status);
export const canPayPurchaseOrder = (po) => purchaseOrderFinancials(po).owed > 0;
/** Approved and not cancelled: the order can go to the supplier. */
export const canSendPurchaseOrder = (po) => COMMITTED.has(po?.status);
