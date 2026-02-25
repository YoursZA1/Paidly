/**
 * Recurring invoice CSV mapping for RecurringInvoice_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching RecurringInvoice_export.csv */
export const RECURRING_INVOICE_CSV_HEADERS = [
  "profile_name",
  "client_id",
  "invoice_template",
  "frequency",
  "start_date",
  "end_date",
  "next_generation_date",
  "status",
  "last_generated_invoice_id",
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
 * Build a CSV row from a recurring invoice record (matches RecurringInvoice_export.csv).
 */
export function recurringInvoiceToCsvRow(rec) {
  const createdDate = toIsoStr(rec.created_at || rec.created_date);
  const updatedDate = toIsoStr(rec.updated_at || rec.updated_date);
  const template = rec.invoice_template != null
    ? (typeof rec.invoice_template === "string" ? rec.invoice_template : JSON.stringify(rec.invoice_template))
    : "";
  return [
    rec.profile_name ?? rec.template_name ?? "",
    rec.client_id ?? "",
    template,
    rec.frequency ?? "monthly",
    toDateStr(rec.start_date),
    toDateStr(rec.end_date),
    toDateStr(rec.next_generation_date),
    rec.status ?? "active",
    rec.last_generated_invoice_id ?? "",
    rec.id ?? "",
    createdDate,
    updatedDate,
    rec.created_by_id ?? "",
    rec.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for RecurringInvoice.create.
 */
export function csvRowToRecurringInvoicePayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const profileName = (row.profile_name || "").trim();
  if (!profileName) return null;

  let invoiceTemplate = null;
  try {
    if (row.invoice_template) invoiceTemplate = JSON.parse(row.invoice_template);
  } catch {
    invoiceTemplate = null;
  }

  const payload = {
    profile_name: profileName,
    client_id: (row.client_id || "").trim() || undefined,
    invoice_template: invoiceTemplate ?? undefined,
    frequency: (row.frequency || "monthly").trim() || "monthly",
    start_date: (row.start_date || "").trim() || undefined,
    end_date: (row.end_date || "").trim() || undefined,
    next_generation_date: (row.next_generation_date || "").trim() || undefined,
    status: (row.status || "active").trim() || "active",
    last_generated_invoice_id: (row.last_generated_invoice_id || "").trim() || undefined,
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseRecurringInvoiceCsv(csvText) {
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
 * Build full CSV string for recurring invoices list.
 */
export function recurringInvoicesToCsv(list) {
  const headerLine = RECURRING_INVOICE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = list.map((r) =>
    recurringInvoiceToCsvRow(r).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
