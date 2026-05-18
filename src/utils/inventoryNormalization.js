const COUNT_STYLES = new Set(["units", "cases", "packs", "boxes", "pallets", "bottles", "bags", "rolls"]);
const DELIVERY_STATUSES = new Set(["pending", "in_transit", "delivered", "cancelled"]);
const MOVEMENT_TYPES = new Set(["sold", "received", "adjusted", "returned"]);

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toTrimmedString(value, fallback = "") {
  if (value == null) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

export function normalizeInventoryProductRow(row) {
  const id = toTrimmedString(row?.id);
  const name = toTrimmedString(row?.name);
  if (!id || !name) return null;

  const rawCountStyle = toTrimmedString(row?.default_unit ?? row?.unit ?? "units").toLowerCase();
  const countStyle = COUNT_STYLES.has(rawCountStyle) ? rawCountStyle : "units";

  const reorder = toNumber(row?.low_stock_threshold, 10);
  const stock = toNumber(row?.stock_quantity, 0);
  const capacityRaw = row?.stock_capacity;
  const stockCapacity =
    capacityRaw != null && capacityRaw !== ""
      ? toNumber(capacityRaw, Math.max(stock, reorder, 1))
      : Math.max(stock, reorder, 1);

  return {
    id,
    name,
    sku: toTrimmedString(row?.sku),
    barcode: toTrimmedString(row?.barcode),
    category: toTrimmedString(row?.category),
    image_url: toTrimmedString(row?.image_url) || null,
    count_style: countStyle,
    units_per_count: 1,
    stock_on_hand: stock,
    stock_capacity: stockCapacity,
    reorder_level: reorder,
    cost: toNumber(row?.cost_price ?? row?.cost_rate, 0),
    price: toNumber(row?.price ?? row?.default_rate, 0),
    is_active: row?.is_active !== false,
    _raw: row,
  };
}

export function normalizeInventoryTransactionRow(row, index = 0) {
  const movementType = toTrimmedString(row?.type).toLowerCase();
  const inferred =
    movementType === "in" ? "received" :
      movementType === "out" ? "sold" :
        movementType;
  const safeType = MOVEMENT_TYPES.has(inferred) ? inferred : "adjusted";

  return {
    id: toTrimmedString(row?.id, `txn-${index}`),
    product_id: toTrimmedString(row?.product_id),
    type: safeType,
    quantity: toNumber(row?.quantity, 0),
    notes: toTrimmedString(row?.source),
    date: row?.created_at ? String(row.created_at).slice(0, 10) : null,
    created_date: row?.created_at || new Date().toISOString(),
  };
}

export function normalizeInventoryDeliveryRow(row, index = 0) {
  const rawStatus = toTrimmedString(row?.status, "pending").toLowerCase();
  const safeStatus = DELIVERY_STATUSES.has(rawStatus) ? rawStatus : "pending";

  const created =
    row?.created_date ?? row?.created_at ?? new Date().toISOString();
  const updated = row?.updated_date ?? row?.updated_at ?? null;

  return {
    id: toTrimmedString(row?.id, `delivery-${index}`),
    product_id: toTrimmedString(row?.product_id),
    quantity: toNumber(row?.quantity, 0),
    status: safeStatus,
    supplier: toTrimmedString(row?.supplier),
    expected_date: toTrimmedString(row?.expected_date),
    tracking_number: toTrimmedString(row?.tracking_number),
    notes: toTrimmedString(row?.notes),
    created_date: created,
    updated_date: updated,
  };
}

/** Catalog row for unified products + services table. */
export function normalizeCatalogTableRow(row) {
  const itemType = row?.item_type === "product" ? "product" : "service";
  if (itemType === "product") {
    const normalized = normalizeInventoryProductRow(row);
    return normalized ? { ...normalized, item_type: "product" } : null;
  }

  const id = toTrimmedString(row?.id);
  const name = toTrimmedString(row?.name);
  if (!id || !name) return null;

  return {
    id,
    name,
    item_type: "service",
    sku: toTrimmedString(row?.sku) || "",
    barcode: "",
    category: toTrimmedString(row?.category),
    image_url: toTrimmedString(row?.image_url) || null,
    count_style: "units",
    units_per_count: 1,
    stock_on_hand: null,
    stock_capacity: null,
    reorder_level: null,
    cost: toNumber(row?.cost_rate ?? row?.cost_price, 0),
    price: toNumber(row?.default_rate ?? row?.price ?? row?.unit_price, 0),
    is_active: row?.is_active !== false,
    _raw: row,
  };
}

export function normalizeCatalogRows(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  return list.map(normalizeCatalogTableRow).filter(Boolean);
}

export function normalizeInventoryRows(kind, rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (kind === "products") {
    return list.map(normalizeInventoryProductRow).filter(Boolean);
  }
  if (kind === "transactions") {
    return list.map((row, index) => normalizeInventoryTransactionRow(row, index));
  }
  if (kind === "deliveries") {
    return list.map((row, index) => normalizeInventoryDeliveryRow(row, index));
  }
  return [];
}

