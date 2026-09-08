import { format as formatDate, startOfMonth, endOfMonth, subMonths, startOfDay } from "date-fns";
import {
  isInvoicePaidLike,
  isInvoiceOpenReceivable,
  invoiceStatusIn,
  INVOICE_STATUS,
  QUOTE_STATUS,
  normalizeQuoteStatus,
} from "@shared/commercial/documentStatuses.js";
import { OutstandingBalanceService } from "@/services/OutstandingBalanceService";

function invoiceAmount(invoice) {
  return Number(invoice?.total_amount || invoice?.total || 0) || 0;
}

function invoiceCreated(invoice) {
  const raw = invoice?.invoice_date || invoice?.created_date || invoice?.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function invoiceDue(invoice) {
  const raw = invoice?.due_date || invoice?.delivery_date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
}

/**
 * Omit meaningless jumps (0 → n as +100%) and extreme percentages without a named period.
 */
export function buildTrend({ current, previous, periodLabel }) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const label = String(periodLabel || "").trim();
  if (!label || prev === 0) return null;
  const delta = cur - prev;
  const pct = (delta / Math.abs(prev)) * 100;
  if (!Number.isFinite(pct) || Math.abs(pct) > 999) return null;
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return {
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
    percent: rounded,
    text: `${sign}${rounded}% vs ${label}`,
  };
}

export function previousCalendarMonthLabel(now = new Date()) {
  return formatDate(subMonths(now, 1), "MMMM yyyy");
}

export function currentCalendarMonthLabel(now = new Date()) {
  return formatDate(now, "MMMM yyyy");
}

export function computeDashboardFinancials({
  invoices = [],
  payments = [],
  quotes = [],
  now = new Date(),
} = {}) {
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));
  const today = startOfDay(now);

  const openReceivables = invoices.filter((inv) => isInvoiceOpenReceivable(inv.status));
  const outstanding = OutstandingBalanceService.calculateTotalOutstanding(openReceivables, payments);

  const paidThisMonth = invoices.filter((inv) => {
    if (!isInvoicePaidLike(inv.status)) return false;
    const d = invoiceCreated(inv);
    return d && d >= thisMonthStart && d <= now;
  });
  const paidLastMonth = invoices.filter((inv) => {
    if (!isInvoicePaidLike(inv.status)) return false;
    const d = invoiceCreated(inv);
    return d && d >= lastMonthStart && d <= lastMonthEnd;
  });

  const overdueInvoices = openReceivables.filter((inv) => {
    if (invoiceStatusIn(inv.status, INVOICE_STATUS.overdue)) return true;
    const due = invoiceDue(inv);
    return due && due < today;
  });

  const draftInvoiceCount = invoices.filter((inv) =>
    invoiceStatusIn(inv.status, INVOICE_STATUS.draft)
  ).length;
  const draftQuoteCount = quotes.filter(
    (quote) => normalizeQuoteStatus(quote.status) === QUOTE_STATUS.draft
  ).length;

  return {
    outstandingTotal: outstanding.totalOutstanding,
    outstandingCount: outstanding.unpaidInvoiceCount,
    paidThisMonth: paidThisMonth.reduce((sum, inv) => sum + invoiceAmount(inv), 0),
    paidLastMonth: paidLastMonth.reduce((sum, inv) => sum + invoiceAmount(inv), 0),
    paidThisMonthCount: paidThisMonth.length,
    overdueAmount: overdueInvoices.reduce((sum, inv) => {
      const invoicePayments = payments.filter((p) => p.invoice_id === inv.id);
      if (invoicePayments.length > 0) {
        return sum + OutstandingBalanceService.calculateInvoiceBalance(inv, invoicePayments).outstanding;
      }
      return sum + invoiceAmount(inv);
    }, 0),
    overdueCount: overdueInvoices.length,
    draftInvoiceCount,
    draftQuoteCount,
    previousMonthLabel: previousCalendarMonthLabel(now),
    currentMonthLabel: currentCalendarMonthLabel(now),
  };
}
