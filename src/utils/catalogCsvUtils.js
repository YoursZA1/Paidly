/**
 * Map unified catalog table rows to Service_export.csv-compatible records.
 */
export function catalogRowsToCsvSource(rows = []) {
  return rows.map((row) => {
    if (row?._raw && typeof row._raw === "object") return row._raw;
    const price = Number(row?.price ?? 0);
    return {
      id: row?.id,
      name: row?.name ?? "",
      description: row?.description ?? "",
      unit_price: price,
      default_rate: price,
      price,
      category: row?.category ?? "",
      item_type: row?.item_type ?? "service",
      unit_of_measure: row?.count_style ?? "unit",
      default_unit: row?.count_style ?? "unit",
      is_active: row?.is_active !== false,
      sku: row?.sku ?? "",
      stock_quantity: row?.stock_on_hand,
    };
  });
}

/**
 * Strip template-only fields before Service.create.
 */
export function sanitizeTemplateItemForCreate(item) {
  if (!item || typeof item !== "object") return null;
  const {
    id: _id,
    is_template: _isTemplate,
    industry: _industry,
    created_at: _createdAt,
    created_by: _createdBy,
    ...rest
  } = item;

  const itemType = rest.item_type || "service";
  const rate = Number(rest.default_rate ?? rest.rate ?? rest.price ?? 0) || 0;

  return {
    ...rest,
    item_type: itemType,
    type: itemType === "product" ? "product" : itemType,
    is_active: rest.is_active !== false,
    default_rate: rate,
    rate,
    price: rate,
    unit_price: rate,
  };
}
