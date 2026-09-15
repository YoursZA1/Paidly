/**
 * Issued payslips from a finalized pay run are locked. Historically they
 * were inserted with status "draft", so the UI showed Draft after issue.
 * Display status maps locked+draft to published without rewriting history.
 */

export const PAYSLIP_STATUS_DRAFT = "draft";
export const PAYSLIP_STATUS_PUBLISHED = "published";
export const PAYSLIP_STATUS_SENT = "sent";
export const PAYSLIP_STATUS_PAID = "paid";

export function displayPayslipStatus(row = {}) {
  const raw = String(row.status || "")
    .trim()
    .toLowerCase();
  if (raw === PAYSLIP_STATUS_PAID) return PAYSLIP_STATUS_PAID;
  if (raw === PAYSLIP_STATUS_SENT) return PAYSLIP_STATUS_SENT;
  if (raw === PAYSLIP_STATUS_PUBLISHED) return PAYSLIP_STATUS_PUBLISHED;
  const issued = Boolean(row.locked || row.pay_run_id);
  if (issued && (!raw || raw === PAYSLIP_STATUS_DRAFT)) return PAYSLIP_STATUS_PUBLISHED;
  return raw || PAYSLIP_STATUS_DRAFT;
}

export function payslipStatusLabel(row) {
  const status = typeof row === "string" ? row : displayPayslipStatus(row);
  if (status === PAYSLIP_STATUS_PUBLISHED) return "Published";
  if (status === PAYSLIP_STATUS_SENT) return "Sent";
  if (status === PAYSLIP_STATUS_PAID) return "Paid";
  if (status === PAYSLIP_STATUS_DRAFT) return "Draft";
  return status ? status.replace(/_/g, " ") : "Draft";
}

export function isPayslipIssued(row = {}) {
  const status = displayPayslipStatus(row);
  return status === PAYSLIP_STATUS_PUBLISHED || status === PAYSLIP_STATUS_SENT || status === PAYSLIP_STATUS_PAID;
}

export function canPublishPayslip(row = {}) {
  return displayPayslipStatus(row) === PAYSLIP_STATUS_DRAFT;
}

export function publishedPayslipWrite() {
  return { status: PAYSLIP_STATUS_PUBLISHED, locked: true };
}
