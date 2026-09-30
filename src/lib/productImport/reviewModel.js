/**
 * Product Import — the review screen's model. Pure: the dialog keeps `rows` (editable raw values +
 * the person's choices) and derives everything else from them on each render.
 */
import {
  DUPLICATE_ACTIONS,
  ROW_STATUS,
  barcodeTakenBy,
  buildImportRows,
  classifyDuplicate,
  identifierKey,
  markInFileDuplicates,
  nameKey,
  rowStatus,
  validateImportRow,
} from "@shared/catalog/productImport.js";

/**
 * @typedef {{
 *   id: string, rowNumber: number, raw: Record<string, string>, meta: any,
 *   selected: boolean, action: "skip" | "update" | "create",
 * }} ReviewRow
 */

/** @returns {ReviewRow[]} */
export function createReviewRows(table, mapping) {
  return buildImportRows(table, mapping).map((r) => {
    const raw = {};
    for (const [k, v] of Object.entries(r.raw)) raw[k] = String(v ?? "");
    return { id: `r${r.rowNumber}`, rowNumber: r.rowNumber, raw, meta: r.meta, selected: true, action: DUPLICATE_ACTIONS.SKIP };
  });
}

function sourceWarnings(meta) {
  const out = [];
  if (meta?.ocr) out.push({ field: "_row", message: "Read with OCR — check every value in this row." });
  else if (meta?.uncertain) out.push({ field: "_row", message: "Read from a PDF without column headings — check this row." });
  if (meta?.messy) out.push({ field: "_row", message: "The PDF columns didn't line up cleanly — check this row." });
  return out;
}

/** Existing catalogue items indexed by SKU / barcode / name key — review re-runs on every edit. */
function indexExisting(existing) {
  const add = (map, key, item) => {
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  };
  const idx = { sku: new Map(), barcode: new Map(), name: new Map() };
  for (const e of existing || []) {
    add(idx.sku, e.sku ? identifierKey(e.sku) : "", e);
    add(idx.barcode, e.barcode ? identifierKey(e.barcode) : "", e);
    add(idx.name, e.name ? nameKey(e.name) : "", e);
  }
  return (value) => [
    ...(value.sku ? idx.sku.get(identifierKey(value.sku)) || [] : []),
    ...(value.barcode ? idx.barcode.get(identifierKey(value.barcode)) || [] : []),
    ...(value.name ? idx.name.get(nameKey(value.name)) || [] : []),
  ];
}

/**
 * @param {ReviewRow[]} rows
 * @param {{ itemType: "product" | "service", existing?: any[], standardRate?: number }} opts
 */
export function evaluateReviewRows(rows, { itemType, existing = [], standardRate } = {}) {
  const validated = rows.map((row) => {
    const v = validateImportRow(row.raw, { itemType, standardRate });
    return { row, ...v, warnings: [...v.warnings, ...sourceWarnings(row.meta)] };
  });
  const inFile = markInFileDuplicates(validated.map((v) => ({ rowNumber: v.row.rowNumber, value: v.value })));
  const candidatesFor = indexExisting(existing);

  return validated.map((v, i) => {
    const errors = [...v.errors];
    const warnings = [...v.warnings];
    const fileDup = inFile.get(i) || null;
    if (fileDup?.kind === "barcode" && itemType === "product") {
      errors.push({ field: "barcode", message: `Same barcode as row ${fileDup.firstRow}.`, fix: "Give each product its own barcode." });
    } else if (fileDup?.kind === "name") {
      warnings.push({ field: "name", message: `Same name as row ${fileDup.firstRow}.` });
    }
    const candidates = candidatesFor(v.value);
    const dup = classifyDuplicate(v.value, candidates);
    const taken = itemType === "product" ? barcodeTakenBy(v.value, candidates, { excludeId: v.row.action === DUPLICATE_ACTIONS.UPDATE ? dup?.match?.id : null }) : null;
    const canUpdate = Boolean(dup) && (itemType === "product" ? dup.match.item_type === "product" : dup.match.item_type !== "product");
    // Creating a second product with an existing barcode is impossible (unique per business).
    if (taken && !(dup && v.row.action === DUPLICATE_ACTIONS.SKIP) && !(canUpdate && v.row.action === DUPLICATE_ACTIONS.UPDATE && taken.id === dup.match.id)) {
      errors.push({ field: "barcode", message: `Barcode already belongs to “${taken.name}”.`, fix: "Use a different barcode, or update the existing product." });
    }
    const fileSkuDup = fileDup?.kind === "sku";
    const isDuplicate = Boolean(dup) || fileSkuDup;
    const validation = { errors, warnings };
    const status = rowStatus(validation, isDuplicate);
    // Update only makes sense against a catalogue item of the same kind.
    const action = !isDuplicate ? DUPLICATE_ACTIONS.CREATE : v.row.action === DUPLICATE_ACTIONS.UPDATE && !canUpdate ? DUPLICATE_ACTIONS.SKIP : v.row.action;
    return {
      ...v.row,
      value: v.value,
      provided: v.provided,
      errors,
      warnings,
      status,
      duplicate: dup ? { id: dup.match.id, name: dup.match.name, matchedBy: dup.matchedBy, itemType: dup.match.item_type } : null,
      fileDuplicate: fileSkuDup ? fileDup : null,
      canUpdate,
      effectiveAction: action,
      importable: v.row.selected && status !== ROW_STATUS.ERROR && !(isDuplicate && action === DUPLICATE_ACTIONS.SKIP),
    };
  });
}

/** Counts for the review header and the Import Summary. */
export function summarizeReview(evaluated) {
  const s = { total: evaluated.length, ready: 0, warning: 0, error: 0, duplicate: 0, importable: 0, creates: 0, updates: 0, skipped: 0, unselected: 0, errorsSelected: 0 };
  for (const r of evaluated) {
    s[r.status] += 1;
    if (!r.selected) s.unselected += 1;
    if (r.importable) {
      s.importable += 1;
      if (r.effectiveAction === DUPLICATE_ACTIONS.UPDATE) s.updates += 1;
      else s.creates += 1;
    } else if (r.selected && r.status === ROW_STATUS.ERROR) s.errorsSelected += 1;
    else if (r.selected) s.skipped += 1;
  }
  return s;
}

/** The rows sent to the server — raw values only; the server normalises and validates again. */
export function toCommitRows(evaluated) {
  return evaluated
    .filter((r) => r.importable)
    .map((r) => ({
      row_number: r.rowNumber,
      action: r.effectiveAction === DUPLICATE_ACTIONS.UPDATE ? "update" : "create",
      ...(r.effectiveAction === DUPLICATE_ACTIONS.UPDATE ? { target_id: r.duplicate.id } : {}),
      ...(r.effectiveAction === DUPLICATE_ACTIONS.CREATE && (r.duplicate || r.fileDuplicate) ? { allow_duplicate: true } : {}),
      values: { ...r.raw },
    }));
}

/** Rows that were not imported, for the result screen and the error report. */
export function notImportedRows(evaluated, results) {
  const byRow = new Map((results || []).map((r) => [r.row_number, r]));
  const out = [];
  for (const r of evaluated) {
    const res = byRow.get(r.rowNumber);
    const product = r.value?.name || r.raw.name || "";
    if (res) {
      if (res.outcome === "failed" || res.outcome === "skipped") out.push({ row: r.rowNumber, product, outcome: res.outcome, reason: res.reason || "", fix: res.fix || "" });
      else if (res.warning) out.push({ row: r.rowNumber, product, outcome: "warning", reason: res.warning, fix: "" });
      continue;
    }
    if (!r.selected) {
      out.push({ row: r.rowNumber, product, outcome: "skipped", reason: "Unticked in review.", fix: "Tick the row to import it." });
    } else if (r.status === ROW_STATUS.ERROR) {
      const e = r.errors[0];
      out.push({ row: r.rowNumber, product, outcome: "failed", reason: e?.message || "Invalid row.", fix: e?.fix || "Correct the row and import again." });
    } else if (r.effectiveAction === DUPLICATE_ACTIONS.SKIP) {
      const by = r.duplicate ? ` (same ${r.duplicate.matchedBy === "sku" ? "SKU" : r.duplicate.matchedBy} as “${r.duplicate.name}”)` : ` (same SKU as row ${r.fileDuplicate?.firstRow})`;
      out.push({ row: r.rowNumber, product, outcome: "skipped", reason: `Duplicate skipped${by}.`, fix: "Choose “Update existing” or “Import as new” to include it." });
    }
  }
  return out;
}
