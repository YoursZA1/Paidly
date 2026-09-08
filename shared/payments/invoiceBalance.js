function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function isConfirmedInvoicePayment(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  if (status === "failed" || status === "cancelled" || status === "canceled" || status === "expired") {
    return false;
  }
  return status === "paid" || status === "completed" || status === "success" || Boolean(row?.paid_at);
}

export function invoiceAmountDue(invoice, payments = []) {
  const total = money(invoice?.total_amount);
  const received = (payments || [])
    .filter(isConfirmedInvoicePayment)
    .reduce((sum, row) => sum + money(row.amount), 0);
  return Math.max(0, Math.round((total - received) * 100) / 100);
}
