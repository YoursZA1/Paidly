/**
 * Load/save adapters for the commercial calculation engine.
 *
 * Negative "Discount" lines are a historical persistence shim only.
 * New writes must not add them. On load they become documentDiscount.
 */

import {
  DISCOUNT_TYPE,
  VAT_MODE,
  asMoneyNumber,
  calculateCommercialDocument,
  commercialMoneyFields,
  persistCommercialDiscountFields,
  normalizeDiscountType,
  normalizeVatMode,
  roundMoney,
  sumPayments,
} from "./calculateCommercialDocument.js";
import { toPersistableCommercialLineItem } from "./commercialLineItem.js";

export function isPersistenceDiscountLine(item) {
  if (!item || typeof item !== "object") return false;
  const name = String(item.service_name || item.name || "").trim();
  if (!/^discount$/i.test(name)) return false;
  const total = asMoneyNumber(item.total_price ?? item.total ?? item.unit_price);
  return total < 0;
}

export function splitPersistenceDiscountLines(items) {
  const list = Array.isArray(items) ? items : [];
  const lines = [];
  let extractedDocumentDiscount = 0;
  for (const item of list) {
    if (isPersistenceDiscountLine(item)) {
      extractedDocumentDiscount = roundMoney(
        extractedDocumentDiscount + Math.abs(asMoneyNumber(item.total_price ?? item.total ?? item.unit_price))
      );
      continue;
    }
    lines.push(item);
  }
  return { lines, extractedDocumentDiscount };
}

function firstFinite(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function inferLineDiscount(item) {
  const explicit = asMoneyNumber(item?.discount ?? item?.discount_value ?? item?.line_discount);
  if (explicit > 0) {
    return {
      discount: explicit,
      discountType: item?.discount_type ?? item?.line_discount_type ?? "fixed",
    };
  }
  const qty = asMoneyNumber(item?.quantity ?? item?.qty ?? 1);
  const unit = asMoneyNumber(item?.unit_price ?? item?.unitPrice ?? item?.rate ?? item?.price);
  const stored = item?.total_price ?? item?.total;
  if (stored == null || stored === "") {
    return { discount: 0, discountType: "fixed" };
  }
  const gross = roundMoney(qty * unit);
  const total = roundMoney(asMoneyNumber(stored));
  const gap = roundMoney(gross - total);
  if (gap > 0.009 && gap <= gross) {
    return { discount: gap, discountType: "fixed" };
  }
  return { discount: 0, discountType: "fixed" };
}

export function linesFromUnknown(items, documentTaxRate = 0) {
  const { lines } = splitPersistenceDiscountLines(items);
  return lines.map((item) => {
    const inferred = inferLineDiscount(item);
    return {
      quantity: asMoneyNumber(item?.quantity ?? item?.qty ?? 1),
      unitPrice: Math.max(
        0,
        asMoneyNumber(item?.unitPrice ?? item?.unit_price ?? item?.rate ?? item?.price ?? item?.amount)
      ),
      discount: inferred.discount,
      discountType: inferred.discountType,
      taxRate: firstFinite(item?.item_tax_rate, item?.tax_rate, item?.taxRate, documentTaxRate),
    };
  });
}

export function inferDocumentDiscountFromStoredTotals(record, extractedDocumentDiscount = 0) {
  if (extractedDocumentDiscount > 0) return 0;
  const explicit = asMoneyNumber(record?.discount_amount ?? record?.discount);
  if (explicit > 0) return 0;

  const subtotal = asMoneyNumber(record?.subtotal);
  const tax = asMoneyNumber(record?.tax_amount);
  const total = asMoneyNumber(record?.total_amount ?? record?.total);
  const rate = asMoneyNumber(record?.tax_rate);
  const vatMode = normalizeVatMode(record?.vat_mode ?? record?.vatMode);
  if (subtotal <= 0) return 0;

  if (vatMode === VAT_MODE.EXCLUSIVE) {
    if (rate > 0 && tax > 0) {
      const taxable = roundMoney(tax / (rate / 100));
      const inferred = roundMoney(subtotal - taxable);
      if (inferred > 0.009 && inferred <= subtotal) return inferred;
    }
    if (rate <= 0 && total > 0) {
      const inferred = roundMoney(subtotal - total);
      if (inferred > 0.009 && inferred <= subtotal) return inferred;
    }
  }
  return 0;
}

export function documentDiscountFromRecord(record, items) {
  const { extractedDocumentDiscount } = splitPersistenceDiscountLines(items ?? record?.items ?? record?.line_items);
  const explicit = asMoneyNumber(record?.discount_amount ?? record?.discount);
  if (explicit > 0) return explicit;
  if (extractedDocumentDiscount > 0) return extractedDocumentDiscount;
  return inferDocumentDiscountFromStoredTotals(record, extractedDocumentDiscount);
}

/**
 * Engine input for a header discount. Percentage uses discount_value; fixed uses the currency amount.
 * Legacy negative Discount lines are only used when the header has no amount.
 */
export function documentDiscountInputFromRecord(record = {}, options = {}) {
  const type = normalizeDiscountType(record.discount_type ?? options.documentDiscountType ?? "fixed");
  const items = options.items ?? record.items ?? record.line_items;
  const { extractedDocumentDiscount } = splitPersistenceDiscountLines(items);
  const headerValue =
    record.discount_value != null && record.discount_value !== "" ? asMoneyNumber(record.discount_value) : null;
  const headerAmount = asMoneyNumber(record.discount_amount ?? record.discount);
  const optionValue = options.documentDiscount != null ? asMoneyNumber(options.documentDiscount) : null;

  if (type === DISCOUNT_TYPE.PERCENTAGE) {
    return {
      documentDiscount: Math.max(0, headerValue ?? optionValue ?? 0),
      documentDiscountType: type,
      extractedDocumentDiscount,
    };
  }

  const explicit =
    headerAmount > 0
      ? headerAmount
      : headerValue != null && headerValue > 0
        ? headerValue
        : optionValue != null && optionValue > 0
          ? optionValue
          : 0;
  const documentDiscount =
    explicit > 0
      ? explicit
      : extractedDocumentDiscount > 0
        ? extractedDocumentDiscount
        : inferDocumentDiscountFromStoredTotals(record, extractedDocumentDiscount);

  return {
    documentDiscount,
    documentDiscountType: type,
    extractedDocumentDiscount,
  };
}

/** Product lines only — skip historical negative Discount rows when summing items. */
export function productLineItems(items) {
  return splitPersistenceDiscountLines(items).lines;
}

export function sumProductLineTotals(items) {
  return roundMoney(
    productLineItems(items).reduce(
      (sum, item) => sum + asMoneyNumber(item.total_price ?? item.total),
      0
    )
  );
}

/**
 * Taxable amount from stored header money without rewriting history.
 * New identity: subtotal - discount = taxable. Historical post-discount subtotals
 * already equal taxable, so they are left as stored when they match total_amount.
 */
export function storedTaxableAmount(record = {}) {
  const subtotal = roundMoney(asMoneyNumber(record.subtotal));
  const discount = roundMoney(asMoneyNumber(record.discount_amount));
  const tax = roundMoney(asMoneyNumber(record.tax_amount));
  const total = roundMoney(asMoneyNumber(record.total_amount ?? record.total));
  const afterDiscount = roundMoney(Math.max(0, subtotal - discount));
  if (total <= 0) return afterDiscount;
  const newIdentity = roundMoney(afterDiscount + tax);
  const postDiscountIdentity = roundMoney(subtotal + tax);
  if (Math.abs(newIdentity - total) <= 0.02) return afterDiscount;
  if (Math.abs(postDiscountIdentity - total) <= 0.02) return subtotal;
  return afterDiscount;
}

function hasStoredMoney(record) {
  if (!record || typeof record !== "object") return false;
  return (
    (record.subtotal != null && record.subtotal !== "") ||
    (record.tax_amount != null && record.tax_amount !== "") ||
    (record.total_amount != null && record.total_amount !== "") ||
    (record.total != null && record.total !== "")
  );
}

/**
 * Build engine input from an invoice/quote/form record.
 */
export function commercialInputFromRecord(record = {}, options = {}) {
  const items = options.items ?? record.items ?? record.line_items ?? [];
  const { lines: productLines } = splitPersistenceDiscountLines(items);
  const documentTaxRate = firstFinite(record.tax_rate, record.taxRate, options.documentTaxRate);
  const discountInput = documentDiscountInputFromRecord(record, { ...options, items });

  const paidAmount =
    options.paidAmount != null
      ? asMoneyNumber(options.paidAmount)
      : record.paid_amount != null || record.amount_paid != null
        ? asMoneyNumber(record.paid_amount ?? record.amount_paid)
        : sumPayments(options.payments ?? record.payments);

  return {
    lines: linesFromUnknown(productLines, documentTaxRate),
    documentDiscount: discountInput.documentDiscount,
    documentDiscountType: discountInput.documentDiscountType,
    vatMode: normalizeVatMode(record.vat_mode ?? record.vatMode ?? options.vatMode),
    documentTaxRate,
    paidAmount,
  };
}

/**
 * Recalculate, or overlay stored parent totals so historical invoices do not jump.
 *
 * @param {object} record
 * @param {{ recalculate?: boolean, preferStored?: boolean, payments?: object[], items?: object[] }} [options]
 */
export function resolveCommercialDocumentTotals(record = {}, options = {}) {
  const recalculate = options.recalculate === true || record.__liveTotals === true;
  const preferStored = options.preferStored !== false && !recalculate;
  const input = commercialInputFromRecord(record, options);
  const calculated = calculateCommercialDocument(input);

  if (preferStored && hasStoredMoney(record)) {
    const grandTotal = roundMoney(
      firstFinite(record.total_amount, record.total, calculated.grandTotal)
    );
    const taxTotal = roundMoney(firstFinite(record.tax_amount, calculated.taxTotal));
    const storedSubtotal = firstFinite(record.subtotal, calculated.subtotal);
    const storedDiscount = firstFinite(record.discount_amount, calculated.documentDiscount);
    const paidAmount = calculated.paidAmount;
    return {
      ...calculated,
      subtotal: roundMoney(storedSubtotal),
      documentDiscount: roundMoney(storedDiscount),
      taxableAmount: storedTaxableAmount({
        ...record,
        subtotal: storedSubtotal,
        discount_amount: storedDiscount,
        tax_amount: taxTotal,
        total_amount: grandTotal,
      }),
      taxTotal,
      grandTotal,
      paidAmount,
      balanceDue: roundMoney(Math.max(0, grandTotal - paidAmount)),
      source: "stored",
    };
  }

  return { ...calculated, source: "calculated" };
}

/**
 * Load-time hydrate: strip persistence discount lines into first-class discount fields.
 */
export function hydrateCommercialDocument(record) {
  if (!record || typeof record !== "object") return record;
  const items = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.line_items)
      ? record.line_items
      : [];
  const { lines, extractedDocumentDiscount } = splitPersistenceDiscountLines(items);
  const documentDiscount = documentDiscountFromRecord(record, items);
  const discountType = normalizeDiscountType(record.discount_type || "fixed");
  const storedValue =
    record.discount_value != null && record.discount_value !== ""
      ? asMoneyNumber(record.discount_value)
      : documentDiscount;
  return {
    ...record,
    items: lines,
    discount: documentDiscount,
    discount_amount: documentDiscount,
    discount_type: discountType,
    discount_value: storedValue,
    vat_mode: normalizeVatMode(record.vat_mode ?? record.vatMode),
    extracted_document_discount: extractedDocumentDiscount,
  };
}

/**
 * Persist product lines only — never a synthetic Discount row.
 */
export function toPersistableLineItems(items, engineResult) {
  const source = Array.isArray(items) ? items.filter((item) => !isPersistenceDiscountLine(item)) : [];
  return source.map((row, index) => {
    const persisted = toPersistableCommercialLineItem(row, index);
    const engineLine = engineResult?.lines?.[index];
    if (engineLine != null) {
      persisted.total_price = engineLine.exclusiveAfterLineDiscount;
    }
    return persisted;
  });
}

export function persistCommercialDocumentFields(result, input = {}) {
  return {
    ...commercialMoneyFields(result),
    ...persistCommercialDiscountFields(result, input),
  };
}
