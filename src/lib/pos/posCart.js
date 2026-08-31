import { catalogUnitPrice, roundMoney } from "../../../server/src/pos/posCheckoutMath.js";

export function posProductStock(product) {
  const n = Number(product?.stock_quantity);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {number} stock
 * @param {{ low?: number }} [opts]
 * @returns {{ text: string, tone: "out" | "low" | "ok" }}
 */
export function posStockLabel(stock, { low = 5 } = {}) {
  const n = Number(stock);
  if (!Number.isFinite(n) || n <= 0) return { text: "Out of stock", tone: "out" };
  if (n <= low) return { text: "LOW STOCK", tone: "low" };
  return { text: `${n} available`, tone: "ok" };
}

/**
 * Device cart only — catalog stock_quantity is unchanged until a paid sale commits.
 * @returns {{ cart: object[], error: string | null, stock?: number }}
 */
export function addPosCartLine(cart, product, qty = 1) {
  const list = Array.isArray(cart) ? cart : [];
  const add = Math.max(0, Math.trunc(Number(qty) || 0));
  if (!product?.id || add <= 0) return { cart: list, error: "INVALID_PRODUCT" };
  const stock = posProductStock(product);
  if (stock <= 0) return { cart: list, error: "OUT_OF_STOCK", stock };
  const existing = list.find((line) => line.product_id === product.id);
  const nextQty = (existing?.quantity || 0) + add;
  if (nextQty > stock) return { cart: list, error: "INSUFFICIENT_STOCK", stock };
  const line = {
    product_id: product.id,
    name: product.name,
    sku: product.sku,
    quantity: nextQty,
    unit_price: catalogUnitPrice(product),
    stock,
  };
  if (existing) {
    return {
      cart: list.map((row) => (row.product_id === product.id ? { ...row, ...line } : row)),
      error: null,
    };
  }
  return { cart: [...list, line], error: null };
}

export function setPosCartQty(cart, productId, quantity) {
  const next = Math.max(0, Math.trunc(Number(quantity) || 0));
  return (Array.isArray(cart) ? cart : [])
    .map((line) => {
      if (line.product_id !== productId) return line;
      if (next > line.stock) return { ...line, quantity: line.stock };
      return { ...line, quantity: next };
    })
    .filter((line) => line.quantity > 0);
}

export function posCartSubtotal(cart) {
  return roundMoney(
    (Array.isArray(cart) ? cart : []).reduce(
      (sum, line) => sum + Number(line.unit_price || 0) * Number(line.quantity || 0),
      0
    )
  );
}
