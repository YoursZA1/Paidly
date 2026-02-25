/**
 * Banking detail CSV mapping for BankingDetail_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching BankingDetail_export.csv */
export const BANKING_CSV_HEADERS = [
  "bank_name",
  "account_name",
  "account_number",
  "routing_number",
  "swift_code",
  "payment_method",
  "additional_info",
  "is_default",
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

/**
 * Build a CSV row from a banking detail record (matches BankingDetail_export.csv).
 */
export function bankingDetailToCsvRow(detail) {
  const createdDate = detail.created_at
    ? (typeof detail.created_at === "string"
        ? detail.created_at
        : new Date(detail.created_at).toISOString())
    : "";
  const updatedDate = detail.updated_at
    ? (typeof detail.updated_at === "string"
        ? detail.updated_at
        : new Date(detail.updated_at).toISOString())
    : "";
  return [
    detail.bank_name ?? "",
    detail.account_name ?? "",
    detail.account_number ?? "",
    detail.routing_number ?? "",
    detail.swift_code ?? "",
    detail.payment_method ?? "bank_transfer",
    detail.additional_info ?? "",
    detail.is_default === true ? "true" : "false",
    detail.id ?? "",
    createdDate,
    updatedDate,
    detail.created_by_id ?? "",
    detail.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for BankingDetail.create.
 */
export function csvRowToBankingDetailPayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const bankName = (row.bank_name || "").trim();
  if (!bankName) return null;

  const parseBool = (v) => v === "true" || v === "1" || v === "yes";

  const payload = {
    bank_name: bankName,
    account_name: (row.account_name || "").trim() || undefined,
    account_number: (row.account_number || "").trim() || undefined,
    routing_number: (row.routing_number || "").trim() || undefined,
    swift_code: (row.swift_code || "").trim() || undefined,
    payment_method: (row.payment_method || "").trim() || "bank_transfer",
    additional_info: (row.additional_info || "").trim() || undefined,
    is_default: parseBool(row.is_default),
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseBankingCsv(csvText) {
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
 * Build full CSV string for banking details list.
 */
export function bankingDetailsToCsv(details) {
  const headerLine = BANKING_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = details.map((d) =>
    bankingDetailToCsvRow(d).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
