/**
 * How a Paidly tenant sells. POS is an optional capability — not every org is a till.
 *
 * - service: normal Paidly (invoices, quotes, clients). No POS.
 * - retail: Paidly + a simple till selling products (catalog / walk-in checkout).
 * - mixed: Paidly + a simple till selling products AND services, plus invoices for account customers.
 * - restaurant: Paidly + the hospitality till (floor → table → order → kitchen → pay).
 *
 * The till only shows what the business type uses: no floor plan, kitchen or dine-in/takeaway for
 * retail and mixed; no till at all for service. See {@link posExperienceFor}.
 *
 * Unset / unknown → treat as service (do not force POS).
 */

export const BUSINESS_TYPE = Object.freeze({
  SERVICE: "service",
  RETAIL: "retail",
  MIXED: "mixed",
  RESTAURANT: "restaurant",
});

export const BUSINESS_TYPE_IDS = Object.freeze([
  BUSINESS_TYPE.SERVICE,
  BUSINESS_TYPE.RETAIL,
  BUSINESS_TYPE.MIXED,
  BUSINESS_TYPE.RESTAURANT,
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
  {
    id: BUSINESS_TYPE.RESTAURANT,
    label: "Restaurant / café / bar",
    description: "Floor plan, tables, kitchen tickets and split bills. Paidly plus a hospitality till.",
  },
]);

/**
 * @param {unknown} raw
 * @returns {'service'|'retail'|'mixed'|'restaurant'|null}
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
  if (
    key === BUSINESS_TYPE.RESTAURANT ||
    key === "restaurant_cafe" ||
    key === "cafe" ||
    key === "café" ||
    key === "bar" ||
    key === "hospitality"
  ) {
    return BUSINESS_TYPE.RESTAURANT;
  }
  return null;
}

/**
 * Till / POS nav and APIs — retail, mixed and restaurant.
 * @param {unknown} raw
 */
export function businessTypeIncludesPos(raw) {
  const type = normalizeBusinessType(raw);
  return type === BUSINESS_TYPE.RETAIL || type === BUSINESS_TYPE.MIXED || type === BUSINESS_TYPE.RESTAURANT;
}

/**
 * Document engine (invoices, quotes) stays available for every type.
 * Retail is still Paidly; mixed is explicit about using both flows.
 * @param {unknown} [_raw]
 */
export function businessTypeIncludesInvoices(_raw) {
  return true;
}

/**
 * Hospitality features (floor plan, tables, kitchen tickets, dine-in / takeaway / counter, orders).
 * Only restaurants / cafés / bars — setting up tables does not turn them on for other types.
 * @param {unknown} raw
 */
export function businessTypeIncludesRestaurant(raw) {
  return normalizeBusinessType(raw) === BUSINESS_TYPE.RESTAURANT;
}

/**
 * Services (hourly, fixed-price work…) can be rung up on the till alongside products. Mixed only:
 * retail and restaurant tills sell stock items; service businesses have no till.
 * @param {unknown} raw
 */
export function businessTypeSellsServicesAtTill(raw) {
  return normalizeBusinessType(raw) === BUSINESS_TYPE.MIXED;
}

/**
 * What the POS front shows for a business type — one place for the till, settings and server.
 * @param {unknown} raw
 * @returns {{ type: string|null, pos: boolean, restaurant: boolean, services: boolean }}
 */
export function posExperienceFor(raw) {
  return {
    type: normalizeBusinessType(raw),
    pos: businessTypeIncludesPos(raw),
    restaurant: businessTypeIncludesRestaurant(raw),
    services: businessTypeSellsServicesAtTill(raw),
  };
}
