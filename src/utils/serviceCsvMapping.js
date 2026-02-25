/**
 * Service/catalog item CSV mapping for Service_export.csv compatibility.
 * Matches table columns and user activity (created_by_id, created_at, updated_at)
 * for capture, storage, and import/export.
 */

/** CSV column headers matching Service_export.csv */
export const SERVICE_CSV_HEADERS = [
  "name",
  "description",
  "unit_price",
  "category",
  "service_type",
  "unit_of_measure",
  "min_quantity",
  "is_active",
  "tags",
  "estimated_duration",
  "requirements",
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
 * Build a CSV row from a service/catalog record (matches Service_export.csv).
 */
export function serviceToCsvRow(service) {
  const createdDate = toIsoStr(service.created_at || service.created_date);
  const updatedDate = toIsoStr(service.updated_at || service.updated_date);
  const unitPrice = service.unit_price ?? service.default_rate ?? service.rate ?? service.price ?? "";
  const tagsStr = Array.isArray(service.tags)
    ? JSON.stringify(service.tags)
    : typeof service.tags === "string"
      ? service.tags
      : "[]";
  return [
    service.name ?? "",
    service.description ?? "",
    unitPrice,
    service.category ?? "",
    service.service_type ?? service.pricing_type ?? "",
    service.unit_of_measure ?? service.default_unit ?? service.unit ?? "",
    service.min_quantity ?? 1,
    service.is_active === true ? "true" : "false",
    tagsStr,
    service.estimated_duration ?? "",
    service.requirements ?? "",
    service.id ?? "",
    createdDate,
    updatedDate,
    service.created_by_id ?? "",
    service.is_sample === true ? "true" : "false",
  ];
}

/**
 * Parse a CSV row into a payload for Service.create.
 */
export function csvRowToServicePayload(headers, values) {
  const row = {};
  headers.forEach((h, i) => {
    const v = values[i];
    row[h.trim()] = v !== undefined && v !== null ? String(v).trim() : "";
  });
  const name = (row.name || "").trim();
  if (!name) return null;

  const parseBool = (v) => v === "true" || v === "1" || v === "yes";
  let tags = [];
  try {
    if (row.tags) tags = JSON.parse(row.tags);
  } catch {
    tags = [];
  }
  if (!Array.isArray(tags)) tags = [];

  const unitPrice = row.unit_price !== "" && row.unit_price != null ? Number(row.unit_price) : 0;
  const defaultUnit = (row.unit_of_measure || "").trim() || "unit";

  const payload = {
    name,
    description: (row.description || "").trim() || undefined,
    item_type: "service",
    default_unit: defaultUnit,
    default_rate: unitPrice,
    rate: unitPrice,
    unit_price: unitPrice,
    unit_of_measure: (row.unit_of_measure || "").trim() || undefined,
    service_type: (row.service_type || "").trim() || undefined,
    category: (row.category || "").trim() || undefined,
    min_quantity: row.min_quantity !== "" && row.min_quantity != null ? parseInt(row.min_quantity, 10) : 1,
    is_active: parseBool(row.is_active),
    tags: tags.length > 0 ? tags : undefined,
    estimated_duration: (row.estimated_duration || "").trim() || undefined,
    requirements: (row.requirements || "").trim() || undefined,
  };
  return payload;
}

/**
 * Parse CSV text (handles quoted fields and newlines inside quotes).
 */
export function parseServiceCsv(csvText) {
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
 * Build full CSV string for services list.
 */
export function servicesToCsv(services) {
  const headerLine = SERVICE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = services.map((s) =>
    serviceToCsvRow(s).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
