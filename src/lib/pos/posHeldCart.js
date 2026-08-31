import { catalogUnitPrice, roundMoney } from "../../../server/src/pos/posCheckoutMath.js";

const keyFor = (orgId) => `paidly_pos_held_cart:${orgId}`;

/**
 * Session scratchpad only — not a sale. Architecture has no held-sale table.
 * Hydrate from the live catalog so stock and listed prices stay current.
 */
export function hydrateHeldCart(held, products) {
  if (!held || !Array.isArray(held.cart) || held.cart.length === 0) {
    return { ok: false, cart: [], discount_amount: 0, client_id: "", client_query: "", skipped: 0 };
  }
  const byId = new Map((products || []).map((row) => [row.id, row]));
  const cart = [];
  let skipped = 0;
  for (const line of held.cart) {
    const product = byId.get(line.product_id);
    if (!product || product.is_active === false) {
      skipped += 1;
      continue;
    }
    const stockRaw = Number(product.stock_quantity);
    const stock = Number.isFinite(stockRaw) ? stockRaw : 0;
    const qty = Math.min(Math.max(0, Math.trunc(Number(line.quantity) || 0)), stock);
    if (qty <= 0) {
      skipped += 1;
      continue;
    }
    cart.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: qty,
      unit_price: catalogUnitPrice(product),
      stock,
    });
  }
  if (cart.length === 0) {
    return { ok: false, cart: [], discount_amount: 0, client_id: "", client_query: "", skipped };
  }
  const subtotal = roundMoney(cart.reduce((sum, line) => sum + line.unit_price * line.quantity, 0));
  const rawDiscount = Number(held.discount_amount);
  const discount_amount =
    Number.isFinite(rawDiscount) && rawDiscount > 0 ? roundMoney(Math.min(rawDiscount, subtotal)) : 0;
  return {
    ok: true,
    cart,
    discount_amount,
    client_id: held.client_id ? String(held.client_id) : "",
    client_query: held.client_query ? String(held.client_query) : "",
    skipped,
  };
}

export function readHeldCart(orgId) {
  if (!orgId || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(keyFor(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.cart) || parsed.cart.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeHeldCart(orgId, payload) {
  if (!orgId || typeof sessionStorage === "undefined") return false;
  try {
    sessionStorage.setItem(keyFor(orgId), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearHeldCart(orgId) {
  if (!orgId || typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(keyFor(orgId));
  } catch {
    /* ignore */
  }
}
