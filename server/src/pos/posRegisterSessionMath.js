import { roundMoney, normalizeOpeningBalance } from "./posRegisterMath.js";

export const POS_SESSION_STATUSES = Object.freeze(["open", "closed"]);

const MAX_CASH = 10_000_000;
const MAX_NOTES = 500;

export function normalizeCountedCash(raw, { label = "Amount", required = true } = {}) {
  if (raw == null || raw === "") {
    if (required) return { ok: false, error: `${label} is required`, code: "CASH_REQUIRED" };
    return { ok: true, amount: undefined };
  }
  const n = roundMoney(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${label} cannot be negative`, code: "CASH_INVALID" };
  }
  if (n > MAX_CASH) {
    return { ok: false, error: `${label} is too large`, code: "CASH_TOO_LARGE" };
  }
  return { ok: true, amount: n };
}

export function normalizeSessionNotes(raw) {
  if (raw == null || raw === "") return null;
  return String(raw).trim().slice(0, MAX_NOTES) || null;
}

export function parseOpenSessionBody(body, registerFloat) {
  const registerId = body?.register_id == null || body.register_id === "" ? null : String(body.register_id).trim();
  if (!registerId) return { ok: false, error: "register_id is required", code: "REGISTER_REQUIRED" };
  const opening =
    body?.opening_balance == null || body.opening_balance === ""
      ? normalizeOpeningBalance(registerFloat ?? 0, { required: true })
      : normalizeOpeningBalance(body.opening_balance, { required: true });
  if (!opening.ok) return opening;
  return {
    ok: true,
    register_id: registerId,
    opening_balance: opening.opening_balance,
    notes: normalizeSessionNotes(body?.notes),
  };
}

export function parseCloseSessionBody(body) {
  const counted = normalizeCountedCash(body?.closing_cash, { label: "Closing cash", required: true });
  if (!counted.ok) return counted;
  return {
    ok: true,
    closing_cash: counted.amount,
    notes: normalizeSessionNotes(body?.notes),
  };
}

/**
 * Cash-drawer totals from pos_sales_events on this shift.
 * Card / digital do not move expected drawer cash.
 */
export function summarizeSessionCash(sales, openingBalance) {
  let cashSales = 0;
  let cashRefunds = 0;
  const rows = Array.isArray(sales) ? sales : [];
  for (const sale of rows) {
    if (sale?.status && sale.status !== "completed") continue;
    if (String(sale?.payment_method || "").toLowerCase() !== "cash") continue;
    const amount = Math.abs(Number(sale.total_amount) || 0);
    if ((sale.sale_kind || "sale") === "return") {
      cashRefunds = roundMoney(cashRefunds + amount);
    } else {
      cashSales = roundMoney(cashSales + amount);
    }
  }
  const opening = roundMoney(openingBalance);
  return {
    cash_sales: cashSales,
    cash_refunds: cashRefunds,
    expected_cash: roundMoney(opening + cashSales - cashRefunds),
  };
}

export function sessionVariance(closingCash, expectedCash) {
  return roundMoney(roundMoney(closingCash) - roundMoney(expectedCash));
}

export function closeSessionSnapshot({ opening_balance, sales, closing_cash }) {
  const totals = summarizeSessionCash(sales, opening_balance);
  const closing = roundMoney(closing_cash);
  return {
    ...totals,
    closing_cash: closing,
    variance: sessionVariance(closing, totals.expected_cash),
  };
}

export function publicSessionView(row, extras = {}) {
  if (!row) return null;
  const status = row.status || "open";
  const closed = status === "closed";
  const cashSales = extras.cash_sales != null ? roundMoney(extras.cash_sales) : roundMoney(row.cash_sales);
  const cashRefunds = extras.cash_refunds != null ? roundMoney(extras.cash_refunds) : roundMoney(row.cash_refunds);
  const expected =
    extras.expected_cash != null ? roundMoney(extras.expected_cash) : roundMoney(row.expected_cash);
  const closing = row.closing_cash == null ? null : roundMoney(row.closing_cash);
  const variance = closed ? roundMoney(row.variance) : extras.variance != null ? roundMoney(extras.variance) : null;
  return {
    id: row.id,
    org_id: row.org_id,
    register_id: row.register_id,
    register_name: extras.register_name || null,
    status,
    opening_balance: roundMoney(row.opening_balance),
    cash_sales: cashSales,
    cash_refunds: cashRefunds,
    expected_cash: expected,
    closing_cash: closing,
    variance,
    opened_by: row.opened_by || null,
    opened_by_name: extras.opened_by_name || null,
    closed_by: row.closed_by || null,
    closed_by_name: extras.closed_by_name || null,
    opened_at: row.opened_at,
    closed_at: row.closed_at || null,
    notes: row.notes || null,
    immutable: closed,
  };
}
