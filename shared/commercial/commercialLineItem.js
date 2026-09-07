/**
 * Commercial line-item persist contract for invoice_items / quote_items.
 * Industry presets stay editor-only and must never be written.
 */

import { asMoneyNumber, normalizeDiscountType, roundMoney } from "./calculateCommercialDocument.js";

export const LINE_ITEM_TYPES = Object.freeze(["service", "product", "labor", "material", "expense"]);

export const LINE_ITEM_TYPE_SET = new Set(LINE_ITEM_TYPES);

export const COMMERCIAL_LINE_ITEM_COLUMNS = Object.freeze([
  "service_id",
  "catalog_item_id",
  "service_name",
  "description",
  "quantity",
  "unit_price",
  "total_price",
  "discount",
  "discount_type",
  "tax_rate",
  "sku",
  "item_type",
  "unit_type",
]);

export function commercialLineItemSelectList(parentIdField) {
  return ["id", parentIdField, ...COMMERCIAL_LINE_ITEM_COLUMNS].join(", ");
}

export function pickCommercialLineItemWriteColumns(row) {
  const out = {};
  const source = row && typeof row === "object" ? row : {};
  for (const key of COMMERCIAL_LINE_ITEM_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

const INDUSTRY_PRESET_KEYS = new Set([
  "industry",
  "industry_preset",
  "industryPreset",
  "selectedPreset",
  "preset",
  "presetKey",
]);

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return undefined;
}

export function asOptionalId(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  return s || null;
}

export function normalizeLineItemType(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (LINE_ITEM_TYPE_SET.has(s)) return s;
  if (s === "labour") return "labor";
  if (s === "goods" || s === "inventory") return "product";
  return null;
}

export function normalizeLineDiscountType(raw) {
  if (raw == null || raw === "") return null;
  return normalizeDiscountType(raw);
}

function optionalText(value, max = 200) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function optionalMoney(value) {
  if (value == null || value === "") return null;
  const n = asMoneyNumber(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundMoney(n);
}

function optionalRate(value) {
  if (value == null || value === "") return null;
  const n = asMoneyNumber(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return roundMoney(Math.min(100, n));
}

/**
 * Persistable invoice_items / quote_items row. Drops industry presets and UI-only keys.
 */
export function toPersistableCommercialLineItem(raw, index = 0) {
  const row = raw && typeof raw === "object" ? raw : {};
  const qty = Number(row.quantity ?? row.qty ?? 1);
  const unit = Number(firstPresent(row.unit_price, row.rate, row.price) ?? 0);
  const hasQtyAndRate =
    firstPresent(row.quantity, row.qty) != null &&
    firstPresent(row.unit_price, row.rate, row.price) != null;
  const total = hasQtyAndRate
    ? roundMoney(qty * unit)
    : row.total_price != null && row.total_price !== ""
      ? Number(row.total_price)
      : row.total != null && row.total !== ""
        ? Number(row.total)
        : roundMoney(qty * unit);
  const serviceName = String(row.service_name || row.name || "").trim();
  const description = String(row.description ?? "").trim();
  const name = serviceName || description.split("\n")[0].slice(0, 200) || "Item";
  const desc =
    description.includes("\n") && !serviceName
      ? description.split("\n").slice(1).join("\n").trim()
      : description === name
        ? ""
        : description;
  const discount = optionalMoney(row.discount ?? row.line_discount);
  const taxRate = optionalRate(row.tax_rate ?? row.item_tax_rate ?? row.taxRate);
  const serviceId = asOptionalId(row.service_id);
  const catalogItemId = asOptionalId(row.catalog_item_id ?? row.catalogItemId);

  const persisted = {
    service_id: serviceId,
    catalog_item_id: catalogItemId,
    service_name: name,
    description: desc,
    quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
    unit_price: Number.isFinite(unit) ? unit : 0,
    total_price: Number.isFinite(total) ? total : 0,
    discount,
    discount_type: discount != null ? normalizeLineDiscountType(row.discount_type ?? row.discountType) || "fixed" : null,
    tax_rate: taxRate,
    sku: optionalText(row.sku ?? row.part_number, 80),
    item_type: normalizeLineItemType(row.item_type ?? row.itemType),
    unit_type: optionalText(row.unit_type ?? row.unitType ?? row.default_unit ?? row.unit, 40),
  };

  for (const key of INDUSTRY_PRESET_KEYS) {
    if (key in persisted) delete persisted[key];
  }
  void index;
  return persisted;
}

export function fromStoredCommercialLineItem(row) {
  const persisted = toPersistableCommercialLineItem(row);
  return {
    ...persisted,
    item_tax_rate: persisted.tax_rate,
    total: persisted.total_price,
  };
}

export function commercialLineItemToComposeRow(row) {
  const stored = fromStoredCommercialLineItem(row);
  const title = String(row?.service_name || row?.name || "").trim();
  const body = String(row?.description || "").trim();
  const description = title && body && body !== title ? `${title}\n${body}` : title || body || stored.service_name;
  return {
    description,
    quantity: stored.quantity,
    unit_price: stored.unit_price,
    total: stored.total_price,
    service_id: stored.service_id,
    catalog_item_id: stored.catalog_item_id,
    sku: stored.sku || "",
    item_type: stored.item_type || "",
    unit_type: stored.unit_type || "",
    tax_rate: stored.tax_rate,
    item_tax_rate: stored.tax_rate,
    discount: stored.discount,
    discount_type: stored.discount_type || "fixed",
  };
}
