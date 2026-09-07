/**
 * Persistence adapters for commercial document lines.
 * Tax/discount math is owned by `shared/commercial/calculateCommercialDocument.js`.
 */

import {
  DISCOUNT_TYPE,
  VAT_MODE,
  calculateCommercialDocument,
  commercialMoneyFields,
  persistCommercialDiscountFields,
  normalizeDiscountType,
  normalizeVatMode,
  roundMoney as engineRound,
} from "@shared/commercial/calculateCommercialDocument.js";
import {
  isPersistenceDiscountLine,
  linesFromUnknown,
  splitPersistenceDiscountLines,
  documentDiscountFromRecord,
} from "@shared/commercial/normalizeCommercialDocument.js";
import { toPersistableCommercialLineItem } from "@shared/commercial/commercialLineItem.js";

export function roundMoney(value) {
  return engineRound(value);
}

export { isPersistenceDiscountLine as isLegacyDiscountLine };

function firstPresent(...values) {
  for (const value of values) {
    if (value != null && value !== "") return value;
  }
  return undefined;
}

/**
 * @param {unknown} raw
 * @param {number} index
 */
export function normalizeLineTotals(raw, index) {
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
  const description = String(row.description ?? (serviceName ? "" : row.description ?? "")).trim();
  return {
    line_order: row.line_order != null ? Number(row.line_order) : index,
    service_id: row.service_id || row.catalog_item_id || null,
    service_name: serviceName || description.split("\n")[0] || "",
    description: description || (row.description ?? ""),
    quantity: Number.isFinite(qty) ? qty : 1,
    unit_price: Number.isFinite(unit) ? unit : 0,
    total_price: Number.isFinite(total) ? total : 0,
    metadata: typeof row.metadata === "object" && row.metadata != null ? row.metadata : {},
  };
}

/**
 * Persist contract for invoice_items / quote_items.
 * Industry presets are editor-only and are stripped here.
 * @param {unknown} raw
 * @param {number} [index]
 */
export function toCommercialItemRow(raw, index = 0) {
  return toPersistableCommercialLineItem(raw, index);
}

/**
 * Header totals from the commercial engine.
 * Defaults to VAT_EXCLUSIVE so historical exclusive invoices keep the same math.
 * @param {unknown[]} items
 * @param {number|string} taxRate
 * @param {number|string} discountValue user input: R amount or percent
 * @param {string} [vatMode]
 * @param {string} [discountType] `fixed` | `percentage`
 */
export function aggregateFromItems(items, taxRate, discountValue, vatMode, discountType) {
  const { lines, extractedDocumentDiscount } = splitPersistenceDiscountLines(items);
  const type = normalizeDiscountType(discountType);
  const headerDisc = Number(discountValue);
  const hasHeader = Number.isFinite(headerDisc) && headerDisc > 0;
  const documentDiscount = hasHeader
    ? headerDisc
    : type === DISCOUNT_TYPE.PERCENTAGE
      ? 0
      : extractedDocumentDiscount;
  const effectiveType = hasHeader ? type : DISCOUNT_TYPE.FIXED;
  const result = calculateCommercialDocument({
    lines: linesFromUnknown(lines, taxRate),
    documentDiscount,
    documentDiscountType: effectiveType,
    documentTaxRate: taxRate,
    vatMode: normalizeVatMode(vatMode || VAT_MODE.EXCLUSIVE),
  });
  const money = commercialMoneyFields(result);
  const discountFields = persistCommercialDiscountFields(result, {
    discount_type: effectiveType,
    discount_value: hasHeader ? headerDisc : result.documentDiscount,
  });
  const rows = lines.map((raw, i) => normalizeLineTotals(raw, i));
  return {
    rows,
    subtotal: money.subtotal,
    discount_type: discountFields.discount_type,
    discount_value: discountFields.discount_value,
    discount_amount: money.discount_amount,
    tax_amount: money.tax_amount,
    total_amount: money.total_amount,
    vat_mode: result.vatMode,
    taxable_amount: result.taxableAmount,
  };
}

/**
 * Line rows ready for invoice_items / quote_items insert.
 * @param {unknown[]} items
 * @param {number|string} [taxRate]
 * @param {number|string} [discountValue]
 * @param {string} [vatMode]
 * @param {string} [discountType]
 */
export function commercialItemsForPersist(items, taxRate = 0, discountValue = 0, vatMode, discountType) {
  const totals = aggregateFromItems(items, taxRate, discountValue, vatMode, discountType);
  const { lines } = splitPersistenceDiscountLines(items);
  return {
    items: lines.map((row, i) => toCommercialItemRow(row, i)),
    totals,
  };
}

export { documentDiscountFromRecord };
