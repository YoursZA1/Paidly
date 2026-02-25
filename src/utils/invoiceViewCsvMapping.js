/**
 * Invoice view CSV mapping for InvoiceView_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching InvoiceView_export.csv */
export const INVOICE_VIEW_CSV_HEADERS = [
  "invoice_id",
  "client_id",
  "viewed_at",
  "ip_address",
  "user_agent",
  "is_read",
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
 * Build a CSV row from an invoice view record (matches InvoiceView_export.csv).
 */
export function invoiceViewToCsvRow(rec) {
  const createdDate = toIsoStr(rec.created_at || rec.created_date);
  const updatedDate = toIsoStr(rec.updated_at || rec.updated_date);
  const viewedAt = toIsoStr(rec.viewed_at);
  return [
    rec.invoice_id ?? "",
    rec.client_id ?? "",
    viewedAt,
    rec.ip_address ?? "",
    rec.user_agent ?? "",
    rec.is_read === true ? "true" : "false",
    rec.id ?? "",
    createdDate,
    updatedDate,
    rec.created_by_id ?? "",
    rec.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for InvoiceView.create.
 */
export function csvRowToInvoiceViewPayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const invoiceId = (row.invoice_id || "").trim();
  if (!invoiceId) return null;

  const payload = {
    invoice_id: invoiceId,
    client_id: (row.client_id || "").trim() || undefined,
    viewed_at: (row.viewed_at || "").trim() || new Date().toISOString(),
    ip_address: (row.ip_address || "").trim() || undefined,
    user_agent: (row.user_agent || "").trim() || undefined,
    is_read: (row.is_read || "").toLowerCase() === "true",
    is_sample: (row.is_sample || "").toLowerCase() === "true",
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseInvoiceViewCsv(csvText) {
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
 * Build full CSV string for invoice views list.
 */
export function invoiceViewsToCsv(list) {
  const headerLine = INVOICE_VIEW_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = list.map((r) =>
    invoiceViewToCsvRow(r).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
