/**
 * Payments-basis VAT report.
 * Output VAT is the VAT inside money received (settled invoice payments and till sales).
 * A paid invoice with no payment row still contributes its stored VAT, on the same date cash flow uses.
 * POS tax-invoice copies are skipped — till VAT stays on pos_sales_events.
 * Input VAT is the VAT saved on a recorded expense (vat, or subtotal × vat_rate).
 * VAT due = output − input.
 */
import { allocateVatOnPayment, roundMoney } from "@shared/commercial/calculateCommercialDocument.js";
import { INVOICE_STATUS, normalizeInvoiceStatus } from "@shared/commercial/documentStatuses.js";
import { isPosOriginInvoice } from "@/logic/invoiceLogic";
import {
  expenseOccurredAt,
  inDayRange,
  invoiceIncomeOccurredAt,
  isCashExpense,
  isSettledPayment,
  moneyAmount,
  paymentOccurredAt,
  toDayKey,
} from "@/utils/cashFlowTruth";
import { isPosReturnEvent, isPosSaleEvent, posPayload, posRefundAffectsCash } from "@/utils/posSalesTruth";

function round(value) {
  return roundMoney(moneyAmount(value));
}

export function expenseInputVat(expense) {
  if (!isCashExpense(expense)) return 0;
  const explicit = moneyAmount(expense.vat);
  if (explicit > 0) return round(explicit);
  const rate = moneyAmount(expense.vat_rate);
  const subtotal = moneyAmount(expense.subtotal);
  if (rate > 0 && subtotal > 0) return round(subtotal * (rate / 100));
  return 0;
}

function line({ id, date, kind, source, reference, description, taxable, vat }) {
  return {
    id,
    date: toDayKey(date),
    kind,
    source,
    reference: reference || "—",
    description: description || source,
    taxable: round(taxable),
    vat: round(vat),
  };
}

function inReportRange(date, start, end) {
  if (!start || !end) return Boolean(toDayKey(date));
  return inDayRange(date, start, end);
}

/**
 * @param {{ invoices?: Array, payments?: Array, expenses?: Array, posSales?: Array, start?: Date, end?: Date }} input
 */
export function buildVatReport({ invoices = [], payments = [], expenses = [], posSales = [], start, end } = {}) {
  const invoiceList = Array.isArray(invoices) ? invoices : [];
  const invoiceById = new Map(invoiceList.filter((row) => row?.id).map((row) => [row.id, row]));
  const lines = [];
  const paidSoFar = new Map();
  const invoicesWithPayments = new Set();

  const settled = (Array.isArray(payments) ? payments : [])
    .filter((payment) => isSettledPayment(payment) && payment.invoice_id && invoiceById.has(payment.invoice_id))
    .filter((payment) => !isPosOriginInvoice(invoiceById.get(payment.invoice_id)))
    .sort((a, b) => String(toDayKey(paymentOccurredAt(a)) || "").localeCompare(String(toDayKey(paymentOccurredAt(b)) || "")));

  for (const payment of settled) {
    const invoice = invoiceById.get(payment.invoice_id);
    const invoiceTotal = moneyAmount(invoice.total_amount ?? invoice.grand_total);
    if (invoiceTotal <= 0) continue;
    const already = moneyAmount(paidSoFar.get(invoice.id));
    const remaining = Math.max(0, invoiceTotal - already);
    if (remaining <= 0) continue;
    const gross = Math.min(moneyAmount(payment.amount), remaining);
    paidSoFar.set(invoice.id, already + gross);
    invoicesWithPayments.add(invoice.id);
    if (!inReportRange(paymentOccurredAt(payment), start, end)) continue;
    const allocated = allocateVatOnPayment(invoice, gross);
    lines.push(line({
      id: `vat-pay-${payment.id || lines.length}`,
      date: paymentOccurredAt(payment),
      kind: "output",
      source: "Invoice",
      reference: invoice.invoice_number || payment.reference || "Payment",
      description: invoice.client_name || "Payment received",
      taxable: allocated.net,
      vat: allocated.tax,
    }));
  }

  for (const invoice of invoiceList) {
    if (!invoice?.id || isPosOriginInvoice(invoice)) continue;
    if (invoicesWithPayments.has(invoice.id)) continue;
    if (normalizeInvoiceStatus(invoice.status) !== INVOICE_STATUS.paid) continue;
    const occurred = invoiceIncomeOccurredAt(invoice);
    if (!inReportRange(occurred, start, end)) continue;
    const vat = moneyAmount(invoice.tax_amount);
    const total = moneyAmount(invoice.total_amount ?? invoice.grand_total);
    if (total <= 0 && vat <= 0) continue;
    lines.push(line({
      id: `vat-inv-${invoice.id}`,
      date: occurred,
      kind: "output",
      source: "Invoice",
      reference: invoice.invoice_number || "Invoice",
      description: invoice.client_name || "Paid invoice",
      taxable: Math.max(0, total - vat),
      vat,
    }));
  }

  for (const sale of Array.isArray(posSales) ? posSales : []) {
    const occurred = sale?.occurred_at;
    if (!inReportRange(occurred, start, end)) continue;
    const snap = posPayload(sale);
    if (isPosSaleEvent(sale)) {
      if (snap.total <= 0 && snap.tax <= 0) continue;
      lines.push(line({
        id: `vat-pos-${sale.id}`,
        date: occurred,
        kind: "output",
        source: "POS",
        reference: sale.receipt_number || sale.external_id || "POS sale",
        description: "Till sale",
        taxable: Math.max(0, snap.total - snap.tax),
        vat: snap.tax,
      }));
      continue;
    }
    if (isPosReturnEvent(sale) && posRefundAffectsCash(sale) && (snap.tax > 0 || snap.total > 0)) {
      lines.push(line({
        id: `vat-pos-ret-${sale.id}`,
        date: occurred,
        kind: "output",
        source: "POS",
        reference: sale.receipt_number || sale.external_id || "POS refund",
        description: "Till refund",
        taxable: -Math.max(0, Math.abs(snap.total) - snap.tax),
        vat: -snap.tax,
      }));
    }
  }

  for (const expense of Array.isArray(expenses) ? expenses : []) {
    const vat = expenseInputVat(expense);
    if (vat <= 0) continue;
    const occurred = expenseOccurredAt(expense);
    if (!inReportRange(occurred, start, end)) continue;
    const subtotal = moneyAmount(expense.subtotal);
    const taxable = subtotal > 0 ? subtotal : Math.max(0, moneyAmount(expense.amount) - vat);
    lines.push(line({
      id: `vat-exp-${expense.id}`,
      date: occurred,
      kind: "input",
      source: "Expense",
      reference: expense.expense_number || expense.receipt_number || "Expense",
      description: expense.vendor || expense.description || expense.category || "Expense",
      taxable,
      vat,
    }));
  }

  lines.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const outputLines = lines.filter((row) => row.kind === "output");
  const inputLines = lines.filter((row) => row.kind === "input");
  const outputVat = round(outputLines.reduce((sum, row) => sum + row.vat, 0));
  const inputVat = round(inputLines.reduce((sum, row) => sum + row.vat, 0));
  const standardRated = round(outputLines.filter((row) => row.vat > 0).reduce((sum, row) => sum + row.taxable, 0));
  const zeroRated = round(outputLines.filter((row) => row.vat === 0).reduce((sum, row) => sum + row.taxable, 0));

  return {
    outputVat,
    inputVat,
    vatDue: round(outputVat - inputVat),
    standardRated,
    zeroRated,
    lines,
  };
}
