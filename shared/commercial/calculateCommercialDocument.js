/**
 * Paidly commercial document calculation authority.
 *
 * Invoice and quote compose, edit, conversion, preview, PDF, reports, and
 * payment balances must call this module. Do not reimplement tax/discount math
 * in UI or PDF renderers.
 *
 * POS till tax stays 0; checkout discount/rounding uses the same helpers.
 */

export const VAT_MODE = Object.freeze({
  INCLUSIVE: "VAT_INCLUSIVE",
  EXCLUSIVE: "VAT_EXCLUSIVE",
});

export const DISCOUNT_TYPE = Object.freeze({
  FIXED: "fixed",
  PERCENTAGE: "percentage",
});

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function asMoneyNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeVatMode(raw) {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if (
    s === VAT_MODE.INCLUSIVE ||
    s === "INCLUSIVE" ||
    s === "TAX_INCLUSIVE" ||
    s === "TRUE" ||
    s === "1"
  ) {
    return VAT_MODE.INCLUSIVE;
  }
  return VAT_MODE.EXCLUSIVE;
}

export function normalizeDiscountType(raw) {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "percentage" || s === "percent" || s === "%") return DISCOUNT_TYPE.PERCENTAGE;
  return DISCOUNT_TYPE.FIXED;
}

export function sumPayments(payments = []) {
  if (!Array.isArray(payments)) return 0;
  return roundMoney(payments.reduce((sum, payment) => sum + asMoneyNumber(payment?.amount), 0));
}

function clampRate(raw) {
  const rate = asMoneyNumber(raw);
  if (rate < 0) return 0;
  if (rate > 100) return 100;
  return rate;
}

function lineDiscountAmount(gross, discount, discountType) {
  const cappedGross = Math.max(0, roundMoney(gross));
  const value = Math.max(0, asMoneyNumber(discount));
  if (cappedGross <= 0 || value <= 0) return 0;
  if (normalizeDiscountType(discountType) === DISCOUNT_TYPE.PERCENTAGE) {
    return roundMoney(Math.min(cappedGross, cappedGross * (value / 100)));
  }
  return roundMoney(Math.min(cappedGross, value));
}

function documentDiscountAmount(base, discount, discountType) {
  return lineDiscountAmount(base, discount, discountType);
}

function exclusiveFromInclusive(inclusive, taxRate) {
  const inc = roundMoney(inclusive);
  const rate = clampRate(taxRate);
  if (inc <= 0) return { exclusive: 0, tax: 0 };
  if (rate <= 0) return { exclusive: inc, tax: 0 };
  const exclusive = roundMoney(inc / (1 + rate / 100));
  return { exclusive, tax: roundMoney(inc - exclusive) };
}

function taxOnExclusive(exclusive, taxRate) {
  const ex = roundMoney(exclusive);
  const rate = clampRate(taxRate);
  if (ex <= 0 || rate <= 0) return 0;
  return roundMoney(ex * (rate / 100));
}

/**
 * Inclusive pricing: customer-facing price is gross. VAT is extracted from gross.
 * @returns {{ net: number, tax: number, exclusive: number, gross: number }}
 */
export function calculateNetFromGross(grossAmount = 0, taxRate = 0) {
  const split = exclusiveFromInclusive(grossAmount, taxRate);
  return {
    net: split.exclusive,
    exclusive: split.exclusive,
    tax: split.tax,
    gross: roundMoney(grossAmount),
  };
}

/**
 * Exclusive pricing: customer-facing price is net. VAT is calculated on net.
 */
export function calculateTaxOnExclusive(netAmount = 0, taxRate = 0) {
  return taxOnExclusive(netAmount, taxRate);
}

/**
 * Exclusive pricing: net + VAT = gross.
 * @returns {{ net: number, tax: number, exclusive: number, gross: number }}
 */
export function calculateGrossFromNet(netAmount = 0, taxRate = 0) {
  const net = roundMoney(Math.max(0, asMoneyNumber(netAmount)));
  const tax = taxOnExclusive(net, taxRate);
  return {
    net,
    exclusive: net,
    tax,
    gross: roundMoney(net + tax),
  };
}

/**
 * VAT on a line's customer-facing price.
 * Exclusive: VAT is added on the net price.
 * Inclusive: VAT is extracted from the gross price.
 */
export function lineTaxFromCustomerPrice(customerPrice = 0, taxRate = 0, vatMode) {
  const price = roundMoney(Math.max(0, asMoneyNumber(customerPrice)));
  if (normalizeVatMode(vatMode) === VAT_MODE.INCLUSIVE) {
    return calculateNetFromGross(price, taxRate).tax;
  }
  return calculateTaxOnExclusive(price, taxRate);
}

/**
 * VAT portion of a payment. Uses stored tax/total when present so exclusive
 * invoices are not treated as VAT-inclusive. Inclusive extract is only used
 * when the document is explicitly VAT_INCLUSIVE and tax cannot be inferred.
 */
export function allocateVatOnPayment(invoice, paymentAmount) {
  const gross = roundMoney(Math.max(0, asMoneyNumber(paymentAmount)));
  if (gross <= 0) {
    return { gross: 0, net: 0, tax: 0, method: "zero" };
  }

  const total = roundMoney(asMoneyNumber(invoice?.total_amount ?? invoice?.total));
  const storedTax = invoice?.tax_amount;
  const hasStoredTax = storedTax != null && storedTax !== "";
  if (total > 0 && hasStoredTax) {
    const tax = roundMoney(gross * (roundMoney(asMoneyNumber(storedTax)) / total));
    return { gross, net: roundMoney(gross - tax), tax, method: "stored_ratio" };
  }

  const hasSubtotal = invoice?.subtotal != null && invoice?.subtotal !== "";
  if (total > 0 && hasSubtotal) {
    const subtotal = roundMoney(asMoneyNumber(invoice.subtotal));
    const discount = roundMoney(asMoneyNumber(invoice.discount_amount ?? invoice.discount));
    const inferredTax = roundMoney(Math.max(0, total - Math.max(0, subtotal - discount)));
    const tax = roundMoney(gross * (inferredTax / total));
    return { gross, net: roundMoney(gross - tax), tax, method: "inferred_from_totals" };
  }

  const rate = clampRate(invoice?.tax_rate ?? invoice?.taxRate);
  const vatMode = normalizeVatMode(invoice?.vat_mode ?? invoice?.vatMode);
  if (rate <= 0) {
    return { gross, net: gross, tax: 0, method: "zero" };
  }

  if (vatMode === VAT_MODE.INCLUSIVE) {
    const split = calculateNetFromGross(gross, rate);
    return { gross, net: split.net, tax: split.tax, method: "inclusive_extract" };
  }

  const exclusiveShare = calculateGrossFromNet(roundMoney(gross * (100 / (100 + rate))), rate);
  return {
    gross,
    net: exclusiveShare.net,
    tax: exclusiveShare.tax,
    method: "exclusive_share",
  };
}

/**
 * Allocate a currency amount across weights. Last eligible line absorbs rounding drift.
 * @param {number} amount
 * @param {number[]} weights
 * @returns {number[]}
 */
export function allocateAmount(amount, weights) {
  const list = Array.isArray(weights) ? weights.map((w) => Math.max(0, asMoneyNumber(w))) : [];
  const totalWeight = list.reduce((sum, weight) => sum + weight, 0);
  const target = roundMoney(Math.max(0, asMoneyNumber(amount)));
  if (list.length === 0 || target <= 0 || totalWeight <= 0) {
    return list.map(() => 0);
  }

  const allocated = list.map((weight) => roundMoney((weight / totalWeight) * target));
  let drift = roundMoney(target - allocated.reduce((sum, value) => sum + value, 0));

  for (let i = allocated.length - 1; i >= 0 && Math.abs(drift) >= 0.005; i -= 1) {
    if (list[i] <= 0) continue;
    const next = roundMoney(allocated[i] + drift);
    if (next < 0) {
      drift = next;
      allocated[i] = 0;
      continue;
    }
    if (next > list[i]) {
      drift = roundMoney(next - list[i]);
      allocated[i] = list[i];
      continue;
    }
    allocated[i] = next;
    drift = 0;
    break;
  }

  return allocated;
}

function emptyResult(paidAmount, vatMode) {
  const paid = roundMoney(Math.max(0, asMoneyNumber(paidAmount)));
  return {
    lines: [],
    subtotal: 0,
    lineDiscountTotal: 0,
    documentDiscount: 0,
    taxableAmount: 0,
    taxTotal: 0,
    grandTotal: 0,
    paidAmount: paid,
    balanceDue: 0,
    vatMode,
  };
}

function normalizeLineInput(raw, documentTaxRate) {
  const quantity = Math.max(0, asMoneyNumber(raw?.quantity ?? raw?.qty ?? 1));
  const unitPrice = Math.max(0, asMoneyNumber(raw?.unitPrice ?? raw?.unit_price ?? raw?.rate ?? raw?.price ?? raw?.amount));
  const taxRate = clampRate(
    raw?.taxRate ?? raw?.item_tax_rate ?? raw?.tax_rate ?? documentTaxRate
  );
  return {
    quantity,
    unitPrice,
    discount: Math.max(0, asMoneyNumber(raw?.discount ?? raw?.discount_value ?? raw?.line_discount)),
    discountType: normalizeDiscountType(raw?.discountType ?? raw?.discount_type ?? raw?.line_discount_type),
    taxRate,
  };
}

/**
 * @param {object} input
 * @param {Array<object>} [input.lines]
 * @param {number|string} [input.documentDiscount]
 * @param {string} [input.documentDiscountType]
 * @param {string} [input.vatMode]
 * @param {number|string} [input.documentTaxRate]
 * @param {number|string} [input.paidAmount]
 * @param {Array<{ amount?: number }>} [input.payments]
 */
export function calculateCommercialDocument(input = {}) {
  const vatMode = normalizeVatMode(input.vatMode ?? input.vat_mode);
  const paidAmount =
    input.paidAmount != null && input.paidAmount !== ""
      ? Math.max(0, asMoneyNumber(input.paidAmount))
      : sumPayments(input.payments);
  const documentTaxRate = clampRate(input.documentTaxRate ?? input.tax_rate ?? input.taxRate);
  const rawLines = Array.isArray(input.lines) ? input.lines : [];

  const prepared = rawLines
    .map((raw) => normalizeLineInput(raw, documentTaxRate))
    .filter((line) => line.quantity > 0 || line.unitPrice > 0 || line.discount > 0);

  if (prepared.length === 0) {
    return emptyResult(paidAmount, vatMode);
  }

  if (vatMode === VAT_MODE.INCLUSIVE) {
    return calculateInclusive(prepared, input, paidAmount, vatMode);
  }
  return calculateExclusive(prepared, input, paidAmount, vatMode);
}

function calculateExclusive(prepared, input, paidAmount, vatMode) {
  const working = prepared.map((line) => {
    const gross = roundMoney(line.quantity * line.unitPrice);
    const lineDiscount = lineDiscountAmount(gross, line.discount, line.discountType);
    const exclusive = roundMoney(Math.max(0, gross - lineDiscount));
    return { ...line, gross, lineDiscount, exclusive };
  });

  const subtotal = roundMoney(working.reduce((sum, line) => sum + line.exclusive, 0));
  const lineDiscountTotal = roundMoney(working.reduce((sum, line) => sum + line.lineDiscount, 0));
  const documentDiscount = documentDiscountAmount(
    subtotal,
    input.documentDiscount ?? input.discount_amount ?? input.discount,
    input.documentDiscountType ?? input.discount_type
  );
  const shares = allocateAmount(
    documentDiscount,
    working.map((line) => line.exclusive)
  );

  const lines = working.map((line, index) => {
    const allocatedDocumentDiscount = shares[index] || 0;
    const taxable = roundMoney(Math.max(0, line.exclusive - allocatedDocumentDiscount));
    const tax = taxOnExclusive(taxable, line.taxRate);
    const inclusive = roundMoney(taxable + tax);
    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      discountType: line.discountType,
      taxRate: line.taxRate,
      gross: line.gross,
      lineDiscount: line.lineDiscount,
      exclusiveAfterLineDiscount: line.exclusive,
      allocatedDocumentDiscount,
      taxable,
      tax,
      inclusive,
    };
  });

  const taxableAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxable, 0));
  const taxTotal = roundMoney(lines.reduce((sum, line) => sum + line.tax, 0));
  const grandTotal = roundMoney(taxableAmount + taxTotal);
  const paid = roundMoney(paidAmount);

  return {
    lines,
    subtotal,
    lineDiscountTotal,
    documentDiscount,
    taxableAmount,
    taxTotal,
    grandTotal,
    paidAmount: paid,
    balanceDue: roundMoney(Math.max(0, grandTotal - paid)),
    vatMode,
  };
}

function calculateInclusive(prepared, input, paidAmount, vatMode) {
  const working = prepared.map((line) => {
    const gross = roundMoney(line.quantity * line.unitPrice);
    const lineDiscount = lineDiscountAmount(gross, line.discount, line.discountType);
    const inclusiveAfterLine = roundMoney(Math.max(0, gross - lineDiscount));
    const split = exclusiveFromInclusive(inclusiveAfterLine, line.taxRate);
    return {
      ...line,
      gross,
      lineDiscount,
      inclusiveAfterLine,
      exclusiveAfterLine: split.exclusive,
    };
  });

  const subtotal = roundMoney(working.reduce((sum, line) => sum + line.exclusiveAfterLine, 0));
  const lineDiscountTotal = roundMoney(working.reduce((sum, line) => sum + line.lineDiscount, 0));
  const inclusiveSubtotal = roundMoney(working.reduce((sum, line) => sum + line.inclusiveAfterLine, 0));
  const documentDiscount = documentDiscountAmount(
    inclusiveSubtotal,
    input.documentDiscount ?? input.discount_amount ?? input.discount,
    input.documentDiscountType ?? input.discount_type
  );
  const shares = allocateAmount(
    documentDiscount,
    working.map((line) => line.inclusiveAfterLine)
  );

  const lines = working.map((line, index) => {
    const allocatedDocumentDiscount = shares[index] || 0;
    const inclusive = roundMoney(Math.max(0, line.inclusiveAfterLine - allocatedDocumentDiscount));
    const split = exclusiveFromInclusive(inclusive, line.taxRate);
    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      discountType: line.discountType,
      taxRate: line.taxRate,
      gross: line.gross,
      lineDiscount: line.lineDiscount,
      exclusiveAfterLineDiscount: line.exclusiveAfterLine,
      allocatedDocumentDiscount,
      taxable: split.exclusive,
      tax: split.tax,
      inclusive,
    };
  });

  const taxableAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxable, 0));
  const taxTotal = roundMoney(lines.reduce((sum, line) => sum + line.tax, 0));
  const grandTotal = roundMoney(lines.reduce((sum, line) => sum + line.inclusive, 0));
  const paid = roundMoney(paidAmount);

  return {
    lines,
    subtotal,
    lineDiscountTotal,
    documentDiscount,
    taxableAmount,
    taxTotal,
    grandTotal,
    paidAmount: paid,
    balanceDue: roundMoney(Math.max(0, grandTotal - paid)),
    vatMode,
  };
}

/** Persist parent money columns from an engine result. */
export function commercialMoneyFields(result) {
  return {
    subtotal: result?.subtotal ?? 0,
    discount_amount: result?.documentDiscount ?? 0,
    tax_amount: result?.taxTotal ?? 0,
    total_amount: result?.grandTotal ?? 0,
  };
}

/**
 * Persist first-class header discount fields.
 * discount_value is the user input (R amount or percent). discount_amount is the capped currency result.
 */
export function persistCommercialDiscountFields(result, input = {}) {
  const type = normalizeDiscountType(input.discount_type ?? input.documentDiscountType ?? "fixed");
  const requested = asMoneyNumber(
    input.discount_value ??
      (type === DISCOUNT_TYPE.PERCENTAGE ? input.documentDiscount : undefined) ??
      input.documentDiscount ??
      input.discount ??
      0
  );
  return {
    discount_type: type,
    discount_value: roundMoney(Math.max(0, requested)),
    discount_amount: result?.documentDiscount ?? 0,
  };
}
