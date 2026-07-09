/**
 * Match POS line items to catalog products and decrement stock atomically.
 */

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} orgId
 * @param {string} saleEventId
 * @param {Array<{ sku?: string, barcode?: string, name?: string, quantity: number }>} items
 */
export async function applyPosSaleInventory(supabase, orgId, saleEventId, items) {
  const results = [];

  for (const item of items || []) {
    const qty = Math.abs(Math.trunc(Number(item.quantity) || 0));
    if (qty <= 0) {
      results.push({ sku: item.sku, barcode: item.barcode, status: "skipped", reason: "invalid_quantity" });
      continue;
    }

    const sku = item.sku ? String(item.sku).trim() : "";
    const barcode = item.barcode ? String(item.barcode).trim() : "";

    let product = null;

    if (sku) {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, sku, barcode, stock_quantity")
        .eq("org_id", orgId)
        .eq("item_type", "product")
        .ilike("sku", sku)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      product = data;
    }

    if (!product && barcode) {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, sku, barcode, stock_quantity")
        .eq("org_id", orgId)
        .eq("item_type", "product")
        .ilike("barcode", barcode)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      product = data;
    }

    if (!product) {
      results.push({
        sku: sku || null,
        barcode: barcode || null,
        name: item.name || null,
        quantity: qty,
        status: "skipped",
        reason: "product_not_found",
      });
      continue;
    }

    const { data: adjusted, error: rpcError } = await supabase.rpc("adjust_inventory_stock", {
      p_product_id: product.id,
      p_org_id: orgId,
      p_delta: -qty,
      p_type: "out",
      p_source: "pos",
      p_reference_id: saleEventId,
    });

    if (rpcError) {
      results.push({
        product_id: product.id,
        name: product.name,
        quantity: qty,
        status: "error",
        reason: rpcError.message || "stock_update_failed",
      });
      continue;
    }

    const newStock = Array.isArray(adjusted) ? adjusted[0]?.new_stock : null;
    results.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: qty,
      status: "applied",
      new_stock: newStock,
    });
  }

  const applied = results.some((r) => r.status === "applied");
  return { applied, results };
}
