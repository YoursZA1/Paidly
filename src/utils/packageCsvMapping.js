/**
 * Package CSV mapping for Package_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching Package_export.csv */
export const PACKAGE_CSV_HEADERS = [
  "name",
  "price",
  "currency",
  "frequency",
  "features",
  "is_recommended",
  "website_link",
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
 * Build a CSV row from a package record (matches Package_export.csv).
 */
export function packageToCsvRow(rec) {
  const createdDate = toIsoStr(rec.created_at || rec.created_date);
  const updatedDate = toIsoStr(rec.updated_at || rec.updated_date);
  const features =
    rec.features != null
      ? Array.isArray(rec.features)
        ? JSON.stringify(rec.features)
        : typeof rec.features === "string"
          ? rec.features
          : "[]"
      : "[]";
  return [
    rec.name ?? "",
    rec.price ?? "",
    rec.currency ?? "ZAR",
    rec.frequency ?? "/month",
    features,
    rec.is_recommended === true ? "true" : "false",
    rec.website_link ?? "",
    rec.id ?? "",
    createdDate,
    updatedDate,
    rec.created_by_id ?? "",
    rec.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Package.create.
 */
export function csvRowToPackagePayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const name = (row.name || "").trim();
  if (!name) return null;

  let features = [];
  try {
    if (row.features) features = JSON.parse(row.features);
  } catch {
    features = [];
  }
  if (!Array.isArray(features)) features = [];

  const payload = {
    name,
    price: Number(row.price) || 0,
    currency: (row.currency || "ZAR").trim() || "ZAR",
    frequency: (row.frequency || "/month").trim() || "/month",
    features,
    is_recommended: (row.is_recommended || "").toLowerCase() === "true",
    website_link: (row.website_link || "").trim() || undefined,
    is_sample: (row.is_sample || "").toLowerCase() === "true",
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parsePackageCsv(csvText) {
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
 * Build full CSV string for packages list.
 */
export function packagesToCsv(list) {
  const headerLine = PACKAGE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = list.map((r) =>
    packageToCsvRow(r).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
