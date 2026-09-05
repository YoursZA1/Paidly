export const DOCUMENT_TABLE_DENSITIES = ["comfortable", "cozy", "compact"];
export const DOCUMENT_TABLE_DENSITY_STORAGE_KEY = "paidly.doc-table-density";

/** Legacy values from the first density pass. */
const DENSITY_ALIASES = Object.freeze({
  spacious: "comfortable",
});

export const DOCUMENT_TABLE_ROW_HEIGHTS = Object.freeze({
  compact: 44,
  cozy: 56,
  comfortable: 72,
});

export const DOCUMENT_TABLE_CELL_CLASS = Object.freeze({
  comfortable: "py-4",
  cozy: "py-2.5",
  compact: "py-1.5 text-sm",
});

export function normalizeDocumentTableDensity(value) {
  const key = String(value || "").trim().toLowerCase();
  const mapped = DENSITY_ALIASES[key] || key;
  return DOCUMENT_TABLE_DENSITIES.includes(mapped) ? mapped : "comfortable";
}

export function documentTableRowHeight(density) {
  return DOCUMENT_TABLE_ROW_HEIGHTS[normalizeDocumentTableDensity(density)];
}

export function documentTableCellClass(density) {
  return DOCUMENT_TABLE_CELL_CLASS[normalizeDocumentTableDensity(density)];
}

export function readStoredDocumentTableDensity() {
  if (typeof window === "undefined") return "comfortable";
  try {
    return normalizeDocumentTableDensity(window.localStorage.getItem(DOCUMENT_TABLE_DENSITY_STORAGE_KEY));
  } catch {
    return "comfortable";
  }
}

export function persistDocumentTableDensity(density) {
  const next = normalizeDocumentTableDensity(density);
  try {
    window.localStorage.setItem(DOCUMENT_TABLE_DENSITY_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  return next;
}
