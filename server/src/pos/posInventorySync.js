/**
 * POS stock moves through the existing inventory architecture:
 * adjust_inventory_stock → apply_inventory_movement (source = pos).
 *
 * Commit point (native till and webhook adapters):
 *   cart / checkout / payment_intent  →  no stock change
 *   verified payment or confirmed cash → pos_sales_events
 *   then inventory movement            → services.stock_quantity
 */

export function nativeInventoryDelta(direction, quantity) {
  const qty = Math.abs(Math.trunc(Number(quantity) || 0));
  const type = direction === "in" ? "in" : "out";
  return { quantity: qty, type, delta: type === "out" ? -qty : qty };
}

/**
 * Inventory must not run because a product is in the cart, Pay is open,
 * or a payment_intents row exists. It needs a recorded sale after settlement.
 */
export function canCommitPosInventory({ saleEventId, paymentSettled } = {}) {
  if (!String(saleEventId || "").trim()) {
    return {
      ok: false,
      code: "SALE_REQUIRED",
      error: "Inventory commits only after a recorded POS sale",
    };
  }
  if (paymentSettled === false) {
    return {
      ok: false,
      code: "PAYMENT_NOT_SETTLED",
      error: "Inventory must not decrease until payment is verified or cash is confirmed",
    };
  }
  return { ok: true };
}

function rpcStock(adjusted) {
  return Array.isArray(adjusted) ? adjusted[0]?.new_stock : null;
}

async function callAdjustInventoryStock(supabase, { productId, orgId, delta, type, saleEventId }) {
  return supabase.rpc("adjust_inventory_stock", {
    p_product_id: productId,
    p_org_id: orgId,
    p_delta: delta,
    p_type: type,
    p_source: "pos",
    p_reference_id: saleEventId,
  });
}

export async function reverseAppliedNativePosInventory(
  supabase,
  orgId,
  saleEventId,
  results,
  originalDirection
) {
  const reverseDirection = originalDirection === "in" ? "out" : "in";
  for (const row of results || []) {
    if (row.status !== "applied" || !row.product_id || !row.quantity) continue;
    const plan = nativeInventoryDelta(reverseDirection, row.quantity);
    const { error } = await callAdjustInventoryStock(supabase, {
      productId: row.product_id,
      orgId,
      delta: plan.delta,
      type: plan.type,
      saleEventId,
    });
    if (error) {
      row.reversed = false;
      row.reverse_error = error.message || "reverse_failed";
    } else {
      row.reversed = true;
      row.status = "reversed";
    }
  }
}

/**
 * Match POS webhook line items to catalog products and decrement stock atomically.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} orgId
 * @param {string} saleEventId
 * @param {Array<{ sku?: string, barcode?: string, name?: string, quantity: number }>} items
 */
export async function applyPosSaleInventory(supabase, orgId, saleEventId, items) {
  const gate = canCommitPosInventory({ saleEventId, paymentSettled: true });
  if (!gate.ok) {
    return {
      applied: false,
      failed: { reason: gate.error },
      results: [{ status: "skipped", reason: gate.code }],
    };
  }

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

    const { data: adjusted, error: rpcError } = await callAdjustInventoryStock(supabase, {
      productId: product.id,
      orgId,
      delta: -qty,
      type: "out",
      saleEventId,
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

    results.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: qty,
      status: "applied",
      new_stock: rpcStock(adjusted),
    });
  }

  const applied = results.some((r) => r.status === "applied");
  const failed = results.find((r) => r.status === "error") || null;
  if (failed) {
    await reverseAppliedNativePosInventory(supabase, orgId, saleEventId, results, "out");
  }
  return { applied: failed ? false : applied, failed, results };
}

/**
 * Native till: decrement (sale) or restock (return) by catalog product id.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} orgId
 * @param {string} saleEventId
 * @param {Array<{ product_id: string, name?: string, sku?: string, quantity: number }>} items
 * @param {"in"|"out"} direction
 */
export async function applyNativePosInventory(supabase, orgId, saleEventId, items, direction) {
  const gate = canCommitPosInventory({ saleEventId, paymentSettled: true });
  if (!gate.ok) {
    return {
      applied: false,
      failed: { reason: gate.error },
      results: [{ status: "skipped", reason: gate.code }],
    };
  }

  const results = [];

  for (const item of items || []) {
    const plan = nativeInventoryDelta(direction, item.quantity);
    const productId = String(item.product_id || "").trim();
    if (!productId || plan.quantity <= 0) {
      results.push({ product_id: productId || null, status: "skipped", reason: "invalid_line" });
      continue;
    }

    const { data: adjusted, error: rpcError } = await callAdjustInventoryStock(supabase, {
      productId,
      orgId,
      delta: plan.delta,
      type: plan.type,
      saleEventId,
    });

    if (rpcError) {
      results.push({
        product_id: productId,
        name: item.name || null,
        quantity: plan.quantity,
        status: "error",
        reason: rpcError.message || "stock_update_failed",
      });
      continue;
    }

    results.push({
      product_id: productId,
      name: item.name || null,
      sku: item.sku || null,
      quantity: plan.quantity,
      status: "applied",
      new_stock: rpcStock(adjusted),
    });
  }

  const applied = results.some((r) => r.status === "applied");
  const failed = results.find((r) => r.status === "error") || null;
  if (failed) {
    await reverseAppliedNativePosInventory(supabase, orgId, saleEventId, results, direction);
  }
  return { applied: failed ? false : applied, failed, results };
}

/**
 * Idempotent commit after a pos_sales_events row exists.
 * Skips when inventory_applied is already true. Does not run for unpaid intents.
 */
export async function commitNativePosInventory(
  supabase,
  { orgId, saleEventId, items, direction = "out", paymentSettled = true } = {}
) {
  const gate = canCommitPosInventory({ saleEventId, paymentSettled });
  if (!gate.ok) {
    return {
      applied: false,
      failed: { reason: gate.error },
      results: [{ status: "skipped", reason: gate.code }],
      code: gate.code,
    };
  }

  const { data: sale, error } = await supabase
    .from("pos_sales_events")
    .select("id, inventory_applied, inventory_result, items")
    .eq("id", saleEventId)
    .maybeSingle();
  if (error) throw error;
  if (!sale?.id) {
    return {
      applied: false,
      failed: { reason: "Sale not found" },
      results: [],
      code: "SALE_NOT_FOUND",
    };
  }
  if (sale.inventory_applied) {
    return {
      applied: true,
      duplicate: true,
      failed: null,
      results: Array.isArray(sale.inventory_result) ? sale.inventory_result : [],
    };
  }

  const lines = Array.isArray(items) && items.length > 0 ? items : sale.items;
  return applyNativePosInventory(supabase, orgId, saleEventId, lines, direction);
}
