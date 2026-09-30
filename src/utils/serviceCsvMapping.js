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
 * Build full CSV string for services list.
 */
export function servicesToCsv(services) {
  const headerLine = SERVICE_CSV_HEADERS.map((h) => escapeCsvCell(h)).join(",");
  const dataLines = services.map((s) =>
    serviceToCsvRow(s).map(escapeCsvCell).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}
