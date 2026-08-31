/**
 * How a Paidly tenant sells. POS is an optional capability — not every org is a till.
 *
 * - service: normal Paidly (invoices, quotes, clients). No POS.
 * - retail: Paidly + POS (catalog / walk-in checkout).
 * - mixed: Paidly + POS + invoices (both money flows).
 *
 * Unset / unknown → treat as service (do not force POS).
 */

export const BUSINESS_TYPE = Object.freeze({
  SERVICE: "service",
  RETAIL: "retail",
  MIXED: "mixed",
});

export const BUSINESS_TYPE_IDS = Object.freeze([
  BUSINESS_TYPE.SERVICE,
  BUSINESS_TYPE.RETAIL,
  BUSINESS_TYPE.MIXED,
]);

export const BUSINESS_TYPE_OPTIONS = Object.freeze([
  {
    id: BUSINESS_TYPE.SERVICE,
    label: "Service",
    description: "Invoices, quotes, and clients. No till — typical for consulting and agencies.",
  },
  {
    id: BUSINESS_TYPE.RETAIL,
    label: "Retail / product",
    description: "Sell from your catalog in person. Paidly plus a POS till.",
  },
  {
    id: BUSINESS_TYPE.MIXED,
    label: "Mixed",
    description: "Invoices for account customers and a till for walk-in sales.",
  },
]);

/**
 * @param {unknown} raw
 * @returns {'service'|'retail'|'mixed'|null}
 */
export function normalizeBusinessType(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (key === BUSINESS_TYPE.SERVICE || key === "services" || key === "invoicing") {
    return BUSINESS_TYPE.SERVICE;
  }
  if (
    key === BUSINESS_TYPE.RETAIL ||
    key === "product" ||
    key === "products" ||
    key === "pos" ||
    key === "shop"
  ) {
    return BUSINESS_TYPE.RETAIL;
  }
  if (key === BUSINESS_TYPE.MIXED || key === "both" || key === "hybrid") {
    return BUSINESS_TYPE.MIXED;
  }
  return null;
}

/**
 * Till / POS nav and APIs — only retail and mixed.
 * @param {unknown} raw
 */
export function businessTypeIncludesPos(raw) {
  const type = normalizeBusinessType(raw);
  return type === BUSINESS_TYPE.RETAIL || type === BUSINESS_TYPE.MIXED;
}

/**
 * Document engine (invoices, quotes) stays available for every type.
 * Retail is still Paidly; mixed is explicit about using both flows.
 * @param {unknown} [_raw]
 */
export function businessTypeIncludesInvoices(_raw) {
  return true;
}
