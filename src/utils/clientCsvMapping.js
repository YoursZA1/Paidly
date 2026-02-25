/**
 * Client CSV mapping for Client_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching Client_export.csv */
export const CLIENT_CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "address",
  "contact_person",
  "notes",
  "currency",
  "industry",
  "segment",
  "total_spent",
  "last_invoice_date",
  "follow_up_enabled",
  "portal_access_token",
  "id",
  "created_date",
  "updated_date",
  "created_by_id",
  "is_sample",
];

/**
 * Escape a CSV cell (quotes, newlines).
 * @param {*} value
 * @returns {string}
 */
function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return `"${s}"`;
}

/**
 * Build a CSV row from a client record (matches Client_export.csv).
 * @param {object} client - Client from API (id, name, email, ... segment, total_spent, last_invoice_date, created_at, updated_at, created_by_id)
 * @returns {string[]}
 */
export function clientToCsvRow(client) {
  const lastInvoiceDate = client.last_invoice_date
    ? (typeof client.last_invoice_date === "string"
        ? client.last_invoice_date
        : new Date(client.last_invoice_date).toISOString())
    : "";
  const createdDate = client.created_at
    ? (typeof client.created_at === "string"
        ? client.created_at
        : new Date(client.created_at).toISOString())
    : "";
  const updatedDate = client.updated_at
    ? (typeof client.updated_at === "string"
        ? client.updated_at
        : new Date(client.updated_at).toISOString())
    : "";
  return [
    client.name ?? "",
    client.email ?? "",
    client.phone ?? "",
    client.address ?? "",
    client.contact_person ?? "",
    client.notes ?? "",
    client.currency ?? "",
    client.industry ?? "",
    client.segment ?? "new",
    client.total_spent ?? 0,
    lastInvoiceDate,
    client.follow_up_enabled !== false ? "true" : "false",
    client.portal_access_token ?? "",
    client.id ?? "",
    createdDate,
    updatedDate,
    client.created_by_id ?? "",
    client.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row (from Client_export.csv) into a payload for Client.create/update.
 * Used for import. created_by_id is kept if present and valid UUID; otherwise not set (API will set current user on create).
 *
 * @param {string[]} headers - First row of CSV
 * @param {string[]} values - Data row
 * @returns {object|null} Payload for Client.create or null if row invalid (e.g. no name)
 */
export function csvRowToClientPayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const name = (row.name || "").trim();
  if (!name) return null;

  const parseBool = (v) => v === "true" || v === "1" || v === "yes";
  const parseNum = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const uuidLike = (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      (v || "").trim()
    );

  const payload = {
    name,
    email: (row.email || "").trim() || undefined,
    phone: (row.phone || "").trim() || undefined,
    address: (row.address || "").trim() || undefined,
    contact_person: (row.contact_person || "").trim() || undefined,
    notes: (row.notes || "").trim() || undefined,
    industry: (row.industry || "").trim() || undefined,
    segment: (row.segment || "").trim() || undefined,
    total_spent: parseNum(row.total_spent),
    follow_up_enabled: parseBool(row.follow_up_enabled),
  };
  if ((row.last_invoice_date || "").trim()) {
    const d = new Date(row.last_invoice_date);
    if (!Number.isNaN(d.getTime())) payload.last_invoice_date = d.toISOString();
  }
  if ((row.created_by_id || "").trim() && uuidLike(row.created_by_id)) {
    payload.created_by_id = row.created_by_id.trim();
  }
  return payload;
}

/**
 * Parse CSV text into array of { headers, rows }.
 * Handles quoted fields and newlines inside quotes (e.g. address).
 * @param {string} csvText
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(csvText) {
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
 * Build full CSV string (header + rows) for client list.
 * @param {object[]} clients
 * @returns {string}
 */
export function clientsToCsv(clients) {
  const headerLine = CLIENT_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = clients.map((c) => clientToCsvRow(c).map(escapeCsvCell).join(","));
  return [headerLine, ...dataLines].join("\n");
}
