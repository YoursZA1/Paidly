/**
 * Cash-flow system of record helpers.
 *
 * Income  = settled invoice payments (cash in), plus paid invoices that have no payment rows,
 *            plus completed POS till sales (minus till_cash refunds).
 *            POS tax-invoice copies (`pos_sale_event_id`) are excluded — till money stays on `pos_sales_events`.
 * Expenses = recorded expenses that were not rejected.
 * Net     = income − expenses for the same period.
 *
 * Dates are compared as calendar days so `date` / `paid_at` / `payment_date` stay consistent.
 */
import {
  addDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { isPosOriginInvoice } from "@/logic/invoiceLogic";
import { collectPosIncomeEvents } from "@/utils/posSalesTruth";

const SETTLED_PAYMENT_STATUS = new Set(["", "completed", "complete", "paid", "success", "successful"]);
const EXCLUDED_PAYMENT_STATUS = new Set(["pending", "processing", "failed", "cancelled", "canceled", "refunded", "void"]);
const PAID_INVOICE_STATUS = new Set(["paid", "partial_paid"]);
const OPEN_INVOICE_STATUS = new Set(["sent", "viewed", "overdue", "partial_paid"]);
const CLOSED_INVOICE_STATUS = new Set(["draft", "cancelled", "canceled", "void", "written_off"]);

export function toDayKey(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, "yyyy-MM-dd");
}

export function inDayRange(value, start, end) {
  const key = toDayKey(value);
  if (!key || !start || !end) return false;
  return key >= format(start, "yyyy-MM-dd") && key <= format(end, "yyyy-MM-dd");
}

export function paymentOccurredAt(payment) {
  return payment?.payment_date || payment?.paid_at || payment?.created_at || payment?.created_date || null;
}

export function expenseOccurredAt(expense) {
  return expense?.date || expense?.created_at || expense?.created_date || null;
}

export function invoiceIncomeOccurredAt(invoice) {
  return (
    invoice?.paid_at ||
    invoice?.sent_date ||
    invoice?.invoice_date ||
    invoice?.created_date ||
    invoice?.created_at ||
    null
  );
}

export function moneyAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function isSettledPayment(payment) {
  if (!payment || moneyAmount(payment.amount) <= 0) return false;
  const status = String(payment.status || "").trim().toLowerCase();
  if (EXCLUDED_PAYMENT_STATUS.has(status)) return false;
  return SETTLED_PAYMENT_STATUS.has(status);
}

export function isCashExpense(expense) {
  if (!expense || moneyAmount(expense.amount) <= 0) return false;
  const approval = String(expense.approval_status || "").trim().toLowerCase();
  return approval !== "rejected";
}

export function invoiceStatusKey(invoice) {
  return String(invoice?.status || "").trim().toLowerCase();
}

export function isOpenInvoice(invoice) {
  const status = invoiceStatusKey(invoice);
  if (!invoice || CLOSED_INVOICE_STATUS.has(status)) return false;
  if (isPosOriginInvoice(invoice)) return false;
  if (status === "paid") return false;
  if (OPEN_INVOICE_STATUS.has(status)) return true;
  return status !== "paid";
}

function settledPayments(payments = []) {
  return (Array.isArray(payments) ? payments : []).filter(isSettledPayment);
}

function cashExpenses(expenses = []) {
  return (Array.isArray(expenses) ? expenses : []).filter(isCashExpense);
}

/**
 * Cash-in rows: every settled payment, plus paid invoices with no payment rows,
 * plus completed POS till events (sales in, till_cash refunds out).
 */
export function collectIncomeEvents(payments = [], invoices = [], posSales = []) {
  const posInvoiceIds = new Set(
    (Array.isArray(invoices) ? invoices : [])
      .filter(isPosOriginInvoice)
      .map((invoice) => invoice.id)
      .filter(Boolean)
  );

  const events = settledPayments(payments)
    .filter((payment) => !payment.invoice_id || !posInvoiceIds.has(payment.invoice_id))
    .map((payment) => ({
      id: `pay-${payment.id}`,
      sourceId: payment.id,
      kind: "income",
      date: paymentOccurredAt(payment),
      amount: moneyAmount(payment.amount),
      name: payment.reference || payment.reference_number || payment.notes || "Payment received",
      category: payment.method || payment.payment_method || "Payment",
      vendor: null,
      invoiceId: payment.invoice_id || null,
    }));

  const paidInvoiceIds = new Set(
    events.map((row) => row.invoiceId).filter(Boolean)
  );

  for (const invoice of Array.isArray(invoices) ? invoices : []) {
    if (isPosOriginInvoice(invoice)) continue;
    const status = invoiceStatusKey(invoice);
    if (!PAID_INVOICE_STATUS.has(status)) continue;
    if (invoice.id && paidInvoiceIds.has(invoice.id)) continue;
    const amount = moneyAmount(invoice.total_amount ?? invoice.grand_total);
    if (amount <= 0) continue;
    events.push({
      id: `inv-${invoice.id}`,
      sourceId: invoice.id,
      kind: "income",
      date: invoiceIncomeOccurredAt(invoice),
      amount,
      name: invoice.client_name || `Invoice #${invoice.invoice_number || invoice.id}`,
      category: "Invoice",
      vendor: null,
      invoiceId: invoice.id,
    });
  }

  return events.concat(collectPosIncomeEvents(posSales));
}

export function collectExpenseEvents(expenses = []) {
  return cashExpenses(expenses).map((expense) => ({
    id: `exp-${expense.id}`,
    sourceId: expense.id,
    kind: "expense",
    date: expenseOccurredAt(expense),
    amount: moneyAmount(expense.amount),
    name: expense.description || expense.category || "Expense",
    category: expense.category || "other",
    vendor: expense.vendor || null,
    expense,
  }));
}

export function sumEventsInRange(events, start, end) {
  return (events || [])
    .filter((row) => inDayRange(row.date, start, end))
    .reduce((sum, row) => sum + moneyAmount(row.amount), 0);
}

/**
 * Calendar bounds for Reports / ReportPDF.
 * `quarter` is the current calendar quarter (not a rolling last-3-months window).
 */
export function getReportPeriodBounds(range = "month", now = new Date(), from, to) {
  if ((range === "custom" || (from && to)) && from && to) {
    const startKey = toDayKey(from);
    const endKey = toDayKey(to);
    if (startKey && endKey) {
      return {
        start: parseISO(`${startKey}T00:00:00`),
        end: parseISO(`${endKey}T00:00:00`),
      };
    }
  }

  switch (String(range || "month").toLowerCase()) {
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "all":
    default:
      return { start: new Date(2000, 0, 1), end: now };
  }
}

/**
 * Cash-basis money totals for a period (or all time when start/end omitted).
 */
export function buildMoneyTotals({ payments = [], expenses = [], invoices = [], posSales = [], start, end } = {}) {
  const incomeEvents = collectIncomeEvents(payments, invoices, posSales);
  const expenseEvents = collectExpenseEvents(expenses);
  const bounded = Boolean(start && end);
  const income = bounded
    ? sumEventsInRange(incomeEvents, start, end)
    : incomeEvents.reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  const expenseTotal = bounded
    ? sumEventsInRange(expenseEvents, start, end)
    : expenseEvents.reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  const profit = income - expenseTotal;
  const marginPercent = income > 0 ? Math.round((profit / income) * 100) : 0;
  return {
    income,
    expenses: expenseTotal,
    profit,
    marginPercent,
    incomeEvents,
    expenseEvents,
  };
}

export function outstandingInvoiceAmount(invoice, payments = []) {
  const total = moneyAmount(invoice?.total_amount ?? invoice?.grand_total);
  if (!invoice?.id) return total;
  const paid = settledPayments(payments)
    .filter((p) => p.invoice_id === invoice.id)
    .reduce((sum, p) => sum + moneyAmount(p.amount), 0);
  return Math.max(0, total - paid);
}

export function collectOutstandingInvoices(invoices = [], payments = []) {
  return (Array.isArray(invoices) ? invoices : [])
    .filter(isOpenInvoice)
    .map((invoice) => {
      const amount = outstandingInvoiceAmount(invoice, payments);
      return {
        id: `outstand-${invoice.id}`,
        sourceId: invoice.id,
        kind: "outstanding",
        date: invoice.delivery_date || invoice.due_date || invoice.invoice_date || invoice.created_date,
        amount,
        name: invoice.client_name || `Invoice #${invoice.invoice_number || invoice.id}`,
        category: invoiceStatusKey(invoice) || "unpaid",
        invoice,
      };
    })
    .filter((row) => row.amount > 0);
}

export function buildCashFlowSnapshot({ payments = [], expenses = [], invoices = [], posSales = [], now = new Date() } = {}) {
  const incomeEvents = collectIncomeEvents(payments, invoices, posSales);
  const expenseEvents = collectExpenseEvents(expenses);
  const outstanding = collectOutstandingInvoices(invoices, payments);

  const thisStart = startOfMonth(now);
  const thisEnd = endOfMonth(now);
  const prevStart = startOfMonth(subMonths(now, 1));
  const prevEnd = endOfMonth(subMonths(now, 1));

  const monthlyIncome = sumEventsInRange(incomeEvents, thisStart, thisEnd);
  const monthlyExpenses = sumEventsInRange(expenseEvents, thisStart, thisEnd);
  const prevIncome = sumEventsInRange(incomeEvents, prevStart, prevEnd);
  const prevExpenses = sumEventsInRange(expenseEvents, prevStart, prevEnd);
  const allTimeIncome = incomeEvents.reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  const allTimeExpenses = expenseEvents.reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  const outstandingTotal = outstanding.reduce((sum, row) => sum + moneyAmount(row.amount), 0);

  const projectionStart = startOfDay(now);
  const projectionEnd = addDays(projectionStart, 30);
  const incomingProjection = outstanding
    .filter((row) => inDayRange(row.date, projectionStart, projectionEnd))
    .reduce((sum, row) => sum + moneyAmount(row.amount), 0);
  const outgoingProjection = expenseEvents
    .filter((row) => inDayRange(row.date, addDays(projectionStart, 1), projectionEnd))
    .reduce((sum, row) => sum + moneyAmount(row.amount), 0);

  return {
    incomeEvents,
    expenseEvents,
    outstanding,
    monthlyIncome,
    monthlyExpenses,
    netCashFlow: monthlyIncome - monthlyExpenses,
    prevIncome,
    prevExpenses,
    prevNet: prevIncome - prevExpenses,
    allTimeIncome,
    allTimeExpenses,
    currentBalance: allTimeIncome - allTimeExpenses,
    outstandingTotal,
    incomingProjection,
    outgoingProjection,
    netProjection: incomingProjection - outgoingProjection,
  };
}

export function buildCashFlowChartRows({ incomeEvents = [], expenseEvents = [], timeRange = "30D", now = new Date() } = {}) {
  if (timeRange === "7D" || timeRange === "30D") {
    const points = timeRange === "7D" ? 7 : 30;
    const rows = [];
    for (let i = points - 1; i >= 0; i -= 1) {
      const day = startOfDay(subDays(now, i));
      const income = sumEventsInRange(incomeEvents, day, day);
      const expenses = sumEventsInRange(expenseEvents, day, day);
      rows.push({
        label: format(day, "MMM d"),
        income,
        expenses,
        net: income - expenses,
      });
    }
    return rows;
  }

  const points = timeRange === "12M" ? 12 : 6;
  const rows = [];
  for (let i = points - 1; i >= 0; i -= 1) {
    const month = subMonths(now, i);
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const income = sumEventsInRange(incomeEvents, start, end);
    const expenses = sumEventsInRange(expenseEvents, start, end);
    rows.push({
      label: format(month, "MMM yyyy"),
      income,
      expenses,
      net: income - expenses,
    });
  }
  return rows;
}

export function buildCashLedger({ incomeEvents = [], expenseEvents = [], outstanding = [], filter = "all" } = {}) {
  let rows = [];
  if (filter === "moneyIn") rows = [...incomeEvents];
  else if (filter === "moneyOut") rows = [...expenseEvents];
  else if (filter === "outstanding") rows = [...outstanding];
  else rows = [...incomeEvents, ...expenseEvents];

  return rows.sort((a, b) => {
    const da = toDayKey(a.date) || "";
    const db = toDayKey(b.date) || "";
    if (da === db) {
      if (a.kind === b.kind) return 0;
      return a.kind === "income" ? -1 : 1;
    }
    return da < db ? 1 : -1;
  });
}

const CASHFLOW_PAGE_SIZE = 500;
const CASHFLOW_MAX_ROWS = 10_000;

/**
 * Page through EntityManager.list. Each call replaces the entity cache with that page,
 * so results are merged here.
 */
export async function listAllCashFlowRecords(entity, sortBy) {
  const byId = new Map();
  let offset = 0;
  while (offset < CASHFLOW_MAX_ROWS) {
    const page = await entity.list(sortBy, { limit: CASHFLOW_PAGE_SIZE, offset });
    const rows = Array.isArray(page) ? page : [];
    for (const row of rows) {
      if (row?.id) byId.set(row.id, row);
    }
    if (rows.length < CASHFLOW_PAGE_SIZE) break;
    offset += CASHFLOW_PAGE_SIZE;
  }
  return Array.from(byId.values());
}
