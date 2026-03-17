import { Service } from "@/api/entities";

/**
 * Apply inventory adjustments for invoice line items.
 *
 * Strict rule:
 * - Only decrement stock for catalog items that are explicitly marked as products.
 * - Never touch pure services or ad-hoc/free-typed lines.
 *
 * Expected line item shape (from CatalogSyncService):
 * - item_type: 'product' | 'service' | 'labor' | 'material' | 'expense'
 * - catalog_item_id: uuid of the catalog row in public.services
 * - quantity: number
 */
export async function applyInventoryForInvoiceItems(lineItems = []) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return;

  // Aggregate required stock movements per product catalog item.
  const requiredByProduct = new Map();

  for (const item of lineItems) {
    const type = item?.item_type;
    const catalogId = item?.catalog_item_id;
    const qty = Number(item?.quantity || 0);

    // Strictly product-only; ignore everything else.
    if (type !== "product") continue;
    if (!catalogId) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const prev = requiredByProduct.get(catalogId) || 0;
    requiredByProduct.set(catalogId, prev + qty);
  }

  if (requiredByProduct.size === 0) return;

  const updates = [];

  for (const [catalogId, totalQty] of requiredByProduct.entries()) {
    updates.push(
      (async () => {
        try {
          const product = await Service.get(catalogId);
          if (!product) return;

          const currentStock = Number(product.stock_quantity ?? 0);
          if (!Number.isFinite(currentStock)) return;

          const nextStock = Math.max(0, currentStock - totalQty);
          // Only update if there is a real change.
          if (nextStock === currentStock) return;

          await Service.update(catalogId, { stock_quantity: nextStock });
        } catch (err) {
          // Best-effort only; never block invoice creation on inventory.
          console.warn("InventoryService: failed to apply stock adjustment", {
            catalogId,
            totalQty,
            error: err,
          });
        }
      })()
    );
  }

  await Promise.all(updates);
}

export default {
  applyInventoryForInvoiceItems,
};

