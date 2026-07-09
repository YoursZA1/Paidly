/**
 * Normalize POS webhook payloads into a canonical sale shape.
 * @typedef {{ externalId: string, status: string, totalAmount: number, currency: string, paymentMethod: string|null, occurredAt: string, items: Array<{ sku?: string, barcode?: string, name?: string, quantity: number, unitPrice?: number }> }} NormalizedPosSale
 */

const COMPLETED_STATUSES = new Set([
  "completed",
  "complete",
  "paid",
  "succeeded",
  "success",
  "payment.succeeded",
  "payment.completed",
]);

function isCompletedStatus(status) {
  const key = String(status || "").trim().toLowerCase();
  return COMPLETED_STATUSES.has(key) || key.endsWith(".succeeded") || key.endsWith(".completed");
}

function centsToAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (Number.isInteger(n) && Math.abs(n) >= 100) return n / 100;
  return n;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .map((item) => {
      const quantity = Math.abs(Math.trunc(Number(item?.quantity ?? item?.qty ?? 1)));
      if (!Number.isFinite(quantity) || quantity <= 0) return null;
      return {
        sku: item?.sku != null ? String(item.sku).trim() : undefined,
        barcode: item?.barcode != null ? String(item.barcode).trim() : undefined,
        name: item?.name != null ? String(item.name).trim() : undefined,
        quantity,
        unitPrice:
          item?.unit_price != null
            ? Number(item.unit_price)
            : item?.unitPrice != null
              ? Number(item.unitPrice)
              : item?.price != null
                ? centsToAmount(item.price)
                : undefined,
      };
    })
    .filter(Boolean);
}

function parseIsoDate(value, fallback = new Date().toISOString()) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedPosSale|null}
 */
export function parseGenericPosSale(payload) {
  if (!payload || typeof payload !== "object") return null;

  const status = String(payload.status || payload.state || "completed");
  if (!isCompletedStatus(status)) return null;

  const externalId = String(payload.id || payload.sale_id || payload.transaction_id || "").trim();
  if (!externalId) return null;

  const totalRaw = payload.total ?? payload.total_amount ?? payload.amount ?? 0;
  const totalAmount = Number(totalRaw);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  return {
    externalId,
    status: "completed",
    totalAmount,
    currency: String(payload.currency || "ZAR").trim().toUpperCase() || "ZAR",
    paymentMethod: payload.payment_method
      ? String(payload.payment_method)
      : payload.paymentMethod
        ? String(payload.paymentMethod)
        : null,
    occurredAt: parseIsoDate(payload.occurred_at || payload.occurredAt || payload.created_at),
    items: normalizeItems(payload.items || payload.line_items || payload.lineItems),
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedPosSale|null}
 */
export function parseYocoPosSale(payload) {
  if (!payload || typeof payload !== "object") return null;

  const eventType = String(payload.type || payload.event || "").trim().toLowerCase();
  const inner = /** @type {Record<string, unknown>} */ (payload.payload || payload.data || payload);

  if (eventType && !isCompletedStatus(eventType) && !isCompletedStatus(String(inner.status || ""))) {
    return null;
  }

  const externalId = String(inner.id || inner.payment_id || payload.id || "").trim();
  if (!externalId) return null;

  const amountCents = inner.amount ?? inner.amount_in_cents ?? inner.total;
  const totalAmount = centsToAmount(amountCents);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const metadata = /** @type {Record<string, unknown>} */ (inner.metadata || {});
  const items = normalizeItems(
    metadata.items || metadata.line_items || inner.items || inner.line_items
  );

  return {
    externalId,
    status: "completed",
    totalAmount,
    currency: String(inner.currency || metadata.currency || "ZAR").trim().toUpperCase() || "ZAR",
    paymentMethod: inner.payment_method ? String(inner.payment_method) : "card",
    occurredAt: parseIsoDate(inner.created_at || inner.createdAt || payload.created_at),
    items,
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedPosSale|null}
 */
export function parseSquarePosSale(payload) {
  if (!payload || typeof payload !== "object") return null;

  const eventType = String(payload.type || "").trim().toLowerCase();
  if (eventType && !eventType.includes("payment") && !eventType.includes("order")) {
    if (!isCompletedStatus(eventType)) return null;
  }

  const data = /** @type {Record<string, unknown>} */ (payload.data || {});
  const obj = /** @type {Record<string, unknown>} */ (data.object || {});
  const payment = /** @type {Record<string, unknown>} */ (obj.payment || obj);

  const externalId = String(payment.id || payment.payment_id || "").trim();
  if (!externalId) return null;

  const amountMoney = /** @type {Record<string, unknown>} */ (payment.amount_money || {});
  const totalAmount = centsToAmount(amountMoney.amount ?? payment.total_money);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) return null;

  const order = /** @type {Record<string, unknown>} */ (payment.order || {});
  const lineItems = order.line_items || payment.line_items || [];

  return {
    externalId,
    status: "completed",
    totalAmount,
    currency: String(amountMoney.currency || payment.currency || "ZAR").trim().toUpperCase() || "ZAR",
    paymentMethod: payment.source_type ? String(payment.source_type) : "card",
    occurredAt: parseIsoDate(payment.created_at || payment.updated_at),
    items: normalizeItems(lineItems),
  };
}

/**
 * @param {string} provider
 * @param {Record<string, unknown>} payload
 * @returns {NormalizedPosSale|null}
 */
export function parsePosSale(provider, payload) {
  const key = String(provider || "generic").trim().toLowerCase();
  if (key === "yoco") return parseYocoPosSale(payload);
  if (key === "square") return parseSquarePosSale(payload);
  return parseGenericPosSale(payload);
}

export { isCompletedStatus, normalizeItems, centsToAmount };
