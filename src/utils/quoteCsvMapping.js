/**
 * Quote CSV mapping for Quote_export.csv compatibility.
 * Matches table columns and user activity (created_by, created_at, updated_at)
 * for capture, storage, and import/export. Items stored as JSON in CSV.
 */

/** CSV column headers matching Quote_export.csv */
export const QUOTE_CSV_HEADERS = [
  "quote_number",
  "client_id",
  "project_title",
  "project_description",
  "items",
  "subtotal",
  "tax_rate",
  "tax_amount",
  "total_amount",
  "banking_detail_id",
  "valid_until",
  "status",
  "notes",
  "terms_conditions",
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
 * Build a CSV row from a quote record (matches Quote_export.csv).
 * @param {Object} quote - Quote with optional .items array
 */
export function quoteToCsvRow(quote) {
  const createdDate = toIsoStr(quote.created_at || quote.created_date);
  const updatedDate = toIsoStr(quote.updated_at || quote.updated_date);
  const itemsJson = Array.isArray(quote.items)
    ? JSON.stringify(
        quote.items.map((i) => ({
          service_name: i.service_name || i.name || "",
          description: i.description || "",
          quantity: Number(i.quantity ?? i.qty ?? 1),
          unit_price: Number(i.unit_price ?? i.rate ?? i.price ?? 0),
          total_price: Number(i.total_price ?? i.total ?? 0),
        }))
      )
    : "[]";
  return [
    quote.quote_number ?? "",
    quote.client_id ?? "",
    quote.project_title ?? "",
    quote.project_description ?? "",
    itemsJson,
    quote.subtotal ?? "",
    quote.tax_rate ?? "",
    quote.tax_amount ?? "",
    quote.total_amount ?? "",
    quote.banking_detail_id ?? "",
    toDateStr(quote.valid_until),
    quote.status ?? "draft",
    quote.notes ?? "",
    quote.terms_conditions ?? "",
    quote.id ?? "",
    createdDate,
    updatedDate,
    quote.created_by ?? quote.created_by_id ?? "",
    quote.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Quote.create.
 */
export function csvRowToQuotePayload(headers, values) {
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

  const num = (v) => (v === "" || v == null ? undefined : Number(v));
  const payload = {
    quote_number: (row.quote_number || "").trim() || undefined,
    client_id: (row.client_id || "").trim() || undefined,
    project_title: (row.project_title || "").trim() || undefined,
    project_description: (row.project_description || "").trim() || undefined,
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
    banking_detail_id: (row.banking_detail_id || "").trim() || undefined,
    valid_until: (row.valid_until || "").trim() || undefined,
    status,
    notes: (row.notes || "").trim() || undefined,
    terms_conditions: (row.terms_conditions || "").trim() || undefined,
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseQuoteCsv(csvText) {
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
 * Build full CSV string for quotes list.
 * @param {Array} quotes - Quotes (each may have .items; attach before calling or fetch in page)
 */
export function quotesToCsv(quotes) {
  const headerLine = QUOTE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = quotes.map((q) =>
    quoteToCsvRow(q).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
