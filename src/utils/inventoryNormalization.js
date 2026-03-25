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

  return {
    id,
    name,
    sku: toTrimmedString(row?.sku),
    category: toTrimmedString(row?.category),
    count_style: countStyle,
    units_per_count: 1,
    stock_on_hand: toNumber(row?.stock_quantity, 0),
    reorder_level: toNumber(row?.low_stock_threshold, 10),
    price: toNumber(row?.price, 0),
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

