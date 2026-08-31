/** Pure checkout helpers — unit-tested, no I/O. */

export const POS_PAYMENT_METHODS = Object.freeze(["cash", "card", "digital", "other"]);
export const POS_SALE_KINDS = Object.freeze(["sale", "return"]);

const MAX_LINES = 100;
const MAX_QTY = 9999;
const MAX_UNIT_PRICE = 10_000_000;

export function roundMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function catalogUnitPrice(row) {
  const candidates = [row?.price, row?.default_rate, row?.unit_price, row?.rate];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return roundMoney(n);
  }
  return 0;
}

/**
 * @param {Array<{ product_id?: string, quantity?: number, unit_price?: number }>} requested
 * @param {Map<string, Record<string, unknown>>} catalogById
 * @param {{ allowPriceOverride?: boolean, requireStock?: boolean }} [opts]
 *   allowPriceOverride defaults false — native checkout always uses catalog prices.
 */
export function buildCheckoutLines(requested, catalogById, opts = {}) {
  const allowPriceOverride = opts.allowPriceOverride === true;
  const requireStock = opts.requireStock !== false;
  const list = Array.isArray(requested) ? requested : [];

  if (list.length === 0) {
    return { ok: false, error: "Add at least one product to the cart" };
  }
  if (list.length > MAX_LINES) {
    return { ok: false, error: `Cart cannot exceed ${MAX_LINES} lines` };
  }

  const merged = new Map();
  for (const raw of list) {
    const productId = String(raw?.product_id || "").trim();
    const qty = Math.trunc(Number(raw?.quantity) || 0);
    if (!productId) {
      return { ok: false, error: "Each line needs a product_id" };
    }
    if (!Number.isFinite(qty) || qty <= 0 || qty > MAX_QTY) {
      return { ok: false, error: "Quantity must be between 1 and 9999" };
    }
    const prev = merged.get(productId) || { quantity: 0, unitPriceOverride: undefined };
    prev.quantity += qty;
    if (raw?.unit_price != null && raw.unit_price !== "") {
      prev.unitPriceOverride = raw.unit_price;
    }
    merged.set(productId, prev);
  }

  const lines = [];
  let subtotal = 0;

  for (const [productId, entry] of merged) {
    const product = catalogById.get(productId);
    if (!product) {
      return { ok: false, error: "One or more products are not in this catalog" };
    }
    if (String(product.item_type || "").toLowerCase() !== "product") {
      return { ok: false, error: `${product.name || "Item"} is not a physical product` };
    }
    if (product.is_active === false) {
      return { ok: false, error: `${product.name || "Item"} is inactive` };
    }

    let unitPrice = catalogUnitPrice(product);
    if (allowPriceOverride && entry.unitPriceOverride != null) {
      const override = Number(entry.unitPriceOverride);
      if (!Number.isFinite(override) || override < 0 || override > MAX_UNIT_PRICE) {
        return { ok: false, error: "Invalid unit price" };
      }
      unitPrice = roundMoney(override);
    }

    const lineTotal = roundMoney(unitPrice * entry.quantity);
    const stock = Number(product.stock_quantity);
    const stockOnHand = Number.isFinite(stock) ? stock : 0;

    if (requireStock && stockOnHand < entry.quantity) {
      return {
        ok: false,
        error: `Not enough stock for ${product.name || "item"} (have ${stockOnHand}, need ${entry.quantity})`,
        code: "INSUFFICIENT_STOCK",
        product_id: productId,
      };
    }

    lines.push({
      product_id: productId,
      line_id: `line-${lines.length + 1}-${productId}`,
      sku: product.sku ? String(product.sku) : "",
      barcode: product.barcode ? String(product.barcode) : "",
      name: String(product.name || "Product"),
      quantity: entry.quantity,
      unit_price: unitPrice,
      line_total: lineTotal,
      stock_on_hand: stockOnHand,
    });
    subtotal = roundMoney(subtotal + lineTotal);
  }

  return { ok: true, lines, subtotal };
}

/**
 * Document-style money identity used by invoices:
 * total = subtotal − discount_amount + tax_amount.
 * Native POS charges the listed catalog price (same as buildCheckoutLines).
 * Tax is not added on top — that would invent a till VAT rate.
 */
export function applyPosSaleDiscount(subtotal, discountAmount) {
  const base = roundMoney(subtotal);
  const raw = Number(discountAmount);
  const discount = Number.isFinite(raw) && raw > 0 ? roundMoney(Math.min(raw, base)) : 0;
  const tax_amount = 0;
  const tax_rate = 0;
  return {
    subtotal: base,
    discount_amount: discount,
    tax_amount,
    tax_rate,
    total: roundMoney(base - discount + tax_amount),
  };
}

/**
 * Client may send display totals. They are never written.
 * If present, they must match the server-calculated payable.
 */
export function quotedCheckoutMoneyConflict(body = {}, payable) {
  const checks = [
    ["total", payable.total],
    ["total_amount", payable.total],
    ["subtotal", payable.subtotal],
    ["tax_amount", payable.tax_amount],
    ["tax_rate", payable.tax_rate],
  ];
  for (const [key, expected] of checks) {
    if (body[key] == null || body[key] === "") continue;
    if (roundMoney(body[key]) !== roundMoney(expected)) {
      return {
        ok: false,
        error: "Sale totals are calculated on the server",
        code: "TOTALS_MISMATCH",
        field: key,
      };
    }
  }
  return { ok: true };
}

export function paymentIntentMatchesPayable(intent, payable, { orgId, currency } = {}) {
  if (!intent?.id) {
    return { ok: false, error: "Payment intent is required", code: "INTENT_REQUIRED" };
  }
  if (orgId && String(intent.org_id || "") !== String(orgId)) {
    return { ok: false, error: "Payment intent is not in this organization", code: "TENANT_MISMATCH" };
  }
  if (roundMoney(intent.amount) !== roundMoney(payable.total)) {
    return { ok: false, error: "Payment amount does not match this sale", code: "AMOUNT_MISMATCH" };
  }
  if (currency && String(intent.currency || "").toUpperCase() !== String(currency).toUpperCase()) {
    return { ok: false, error: "Payment currency does not match this sale", code: "CURRENCY_MISMATCH" };
  }
  return { ok: true };
}

export function computeCashChange(total, amountTendered) {
  const due = roundMoney(total);
  if (amountTendered == null || amountTendered === "") {
    return { ok: false, error: "Enter cash tendered" };
  }
  const tendered = roundMoney(amountTendered);
  if (!Number.isFinite(tendered) || tendered < 0) {
    return { ok: false, error: "Invalid cash amount" };
  }
  if (tendered < due) {
    return { ok: false, error: "Cash tendered is less than the total" };
  }
  return { ok: true, amountTendered: tendered, changeDue: roundMoney(tendered - due) };
}

export function normalizePaymentMethod(raw) {
  const key = String(raw || "").trim().toLowerCase();
  return POS_PAYMENT_METHODS.includes(key) ? key : null;
}

export function makeReceiptNumber(kind, now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prefix = kind === "return" ? "RET" : "POS";
  return `${prefix}-${y}${m}${d}-${suffix}`;
}

/** Checkout writes `pos_sales_events` only after the intent is paid (cash till-check or verified digital). */
export function posSaleCompletesWhenPaid(intent) {
  return String(intent?.status || "").toLowerCase() === "paid";
}

/** Named customer on a sale must be an org `clients` row — not another tenant. */
export function clientBelongsToCheckoutOrg(client, orgId) {
  const tenant = String(orgId || "").trim();
  return Boolean(client?.id && tenant && String(client.org_id || "") === tenant);
}

/** Till attach is POS customers only (created on the till or explicitly enabled). */
export function posCustomerEligibleForTill(client, orgId) {
  return clientBelongsToCheckoutOrg(client, orgId) && client?.pos_enabled === true;
}

export function remainingReturnQuantities(originalItems, returnedItems) {
  const remaining = new Map();
  for (const item of originalItems || []) {
    const id = String(item.product_id || item.sku || "");
    if (!id) continue;
    remaining.set(id, (remaining.get(id) || 0) + Math.abs(Math.trunc(Number(item.quantity) || 0)));
  }
  for (const item of returnedItems || []) {
    const id = String(item.product_id || item.sku || "");
    if (!id) continue;
    remaining.set(id, (remaining.get(id) || 0) - Math.abs(Math.trunc(Number(item.quantity) || 0)));
  }
  return remaining;
}
