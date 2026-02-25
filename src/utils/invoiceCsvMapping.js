/**
 * Invoice CSV mapping for Invoice_export.csv compatibility.
 * Matches table columns and user activity (created_by, created_at, updated_at)
 * for capture, storage, and import/export. Items and payments are stored as JSON in CSV.
 */

/** CSV column headers matching Invoice_export.csv */
export const INVOICE_CSV_HEADERS = [
  "invoice_number",
  "client_id",
  "project_title",
  "project_description",
  "delivery_address",
  "items",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "upfront_payment",
  "milestone_payment",
  "final_payment",
  "delivery_date",
  "milestone_date",
  "final_date",
  "banking_detail_id",
  "status",
  "payments",
  "pdf_url",
  "notes",
  "recurring_invoice_id",
  "public_share_token",
  "sent_to_email",
  "owner_company_name",
  "owner_company_address",
  "owner_logo_url",
  "owner_email",
  "owner_currency",
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
  "is_sample",
];

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

function toDateStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function toIsoStr(val) {
  if (!val) return "";
  if (typeof val === "string") return val;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  } catch {
    return "";
  }
}

/**
 * Build payments JSON array for CSV (matches Invoice_export format).
 * @param {Array} payments - Array of { amount, paid_at, method, reference, notes }
 */
function paymentsToJson(payments) {
  if (!Array.isArray(payments) || payments.length === 0) return "[]";
  const arr = payments.map((p) => ({
    amount: Number(p.amount) || 0,
    date: p.paid_at ? toIsoStr(p.paid_at) : "",
    method: p.method || "",
    notes: p.reference || p.notes || "",
  }));
  return JSON.stringify(arr);
}

/**
 * Build a CSV row from an invoice record (matches Invoice_export.csv).
 * @param {Object} invoice - Invoice with optional .items array
 * @param {Array} payments - Payments for this invoice (optional)
 */
export function invoiceToCsvRow(invoice, payments = []) {
  const createdDate = toIsoStr(invoice.created_at || invoice.created_date);
  const updatedDate = toIsoStr(invoice.updated_at || invoice.updated_date);
  const itemsJson = Array.isArray(invoice.items)
    ? JSON.stringify(
        invoice.items.map((i) => ({
          service_name: i.service_name || i.name || "",
          description: i.description || "",
          quantity: Number(i.quantity ?? i.qty ?? 1),
          unit_price: Number(i.unit_price ?? i.rate ?? i.price ?? 0),
          total_price: Number(i.total_price ?? i.total ?? 0),
        }))
      )
    : "[]";
  return [
    invoice.invoice_number ?? "",
    invoice.client_id ?? "",
    invoice.project_title ?? "",
    invoice.project_description ?? "",
    invoice.delivery_address ?? "",
    itemsJson,
    invoice.subtotal ?? "",
    invoice.tax_rate ?? "",
    invoice.tax_amount ?? "",
    invoice.total_amount ?? "",
    invoice.upfront_payment ?? "",
    invoice.milestone_payment ?? "",
    invoice.final_payment ?? "",
    toDateStr(invoice.delivery_date),
    toDateStr(invoice.milestone_date),
    toDateStr(invoice.final_date),
    invoice.banking_detail_id ?? "",
    invoice.status ?? "draft",
    paymentsToJson(payments),
    invoice.pdf_url ?? "",
    invoice.notes ?? "",
    invoice.recurring_invoice_id ?? "",
    invoice.public_share_token ?? "",
    invoice.sent_to_email ?? "",
    invoice.owner_company_name ?? "",
    invoice.owner_company_address ?? "",
    invoice.owner_logo_url ?? "",
    invoice.owner_email ?? "",
    invoice.owner_currency ?? "",
    invoice.id ?? "",
    createdDate,
    updatedDate,
    invoice.created_by ?? invoice.created_by_id ?? "",
    invoice.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Invoice.create and optional payments to create.
 * Returns { payload, payments } where payload is for Invoice.create and payments is array of { amount, paid_at, method, notes }.
 */
export function csvRowToInvoicePayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const status = (row.status || "draft").trim() || "draft";
  let items = [];
  try {
    if (row.items) items = JSON.parse(row.items);
  } catch {
    items = [];
  }
  if (!Array.isArray(items)) items = [];
  let payments = [];
  try {
    if (row.payments) payments = JSON.parse(row.payments);
  } catch {
    payments = [];
  }
  if (!Array.isArray(payments)) payments = [];

  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const payload = {
    invoice_number: (row.invoice_number || "").trim() || undefined,
    client_id: (row.client_id || "").trim() || undefined,
    project_title: (row.project_title || "").trim() || undefined,
    project_description: (row.project_description || "").trim() || undefined,
    delivery_address: (row.delivery_address || "").trim() || undefined,
    items: items.map((i) => ({
      service_name: i.service_name || i.name || "",
      description: i.description || "",
      quantity: Number(i.quantity ?? i.qty ?? 1),
      unit_price: Number(i.unit_price ?? i.rate ?? i.price ?? 0),
      total_price: Number(i.total_price ?? i.total ?? 0),
    })),
    subtotal: num(row.subtotal) ?? 0,
    tax_rate: num(row.tax_rate) ?? 0,
    tax_amount: num(row.tax_amount) ?? 0,
    total_amount: num(row.total_amount) ?? 0,
    upfront_payment: num(row.upfront_payment),
    milestone_payment: num(row.milestone_payment),
    final_payment: num(row.final_payment),
    delivery_date: (row.delivery_date || "").trim() || undefined,
    milestone_date: (row.milestone_date || "").trim() || undefined,
    final_date: (row.final_date || "").trim() || undefined,
    banking_detail_id: (row.banking_detail_id || "").trim() || undefined,
    status,
    pdf_url: (row.pdf_url || "").trim() || undefined,
    notes: (row.notes || "").trim() || undefined,
    recurring_invoice_id: (row.recurring_invoice_id || "").trim() || undefined,
    public_share_token: (row.public_share_token || "").trim() || undefined,
    sent_to_email: (row.sent_to_email || "").trim() || undefined,
    owner_company_name: (row.owner_company_name || "").trim() || undefined,
    owner_company_address: (row.owner_company_address || "").trim() || undefined,
    owner_logo_url: (row.owner_logo_url || "").trim() || undefined,
    owner_email: (row.owner_email || "").trim() || undefined,
    owner_currency: (row.owner_currency || "").trim() || undefined,
  };
  const paymentsForRecord = payments.map((p) => ({
    amount: Number(p.amount) || 0,
    paid_at: p.date || null,
    method: p.method || "",
    notes: p.notes || p.reference || "",
  }));
  return { payload, payments: paymentsForRecord };
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseInvoiceCsv(csvText) {
  const rows = [];
  let currentRow = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i];
    if (c === '"') {
      if (inQuotes && csvText[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && (c === "," || c === "\n" || c === "\r")) {
      if (c === ",") {
        currentRow.push(cell);
        cell = "";
      } else {
        if (c === "\r" && csvText[i + 1] === "\n") i++;
        currentRow.push(cell);
        cell = "";
        if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
        currentRow = [];
      }
    } else {
      cell += c;
    }
  }
  currentRow.push(cell);
  if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0];
  return { headers, rows: rows.slice(1) };
}

/**
 * Build full CSV string for invoices list.
 * @param {Array} invoices - Invoices (each may have .items; pass paymentsMap for payments)
 * @param {Map<string, Array>} paymentsMap - Optional Map<invoice_id, payments[]>
 */
export function invoicesToCsv(invoices, paymentsMap = new Map()) {
  const headerLine = INVOICE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = invoices.map((inv) =>
    invoiceToCsvRow(inv, paymentsMap.get(inv.id) || []).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
