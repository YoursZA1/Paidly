/**
 * Multi-brand POS catalog visibility.
 * Shared products (company_id null) appear on every till.
 * Private products appear only on a register whose company_id matches.
 * A brandless register cannot sell another brand's private SKUs.
 * Header document-brand switcher is not a catalog scope.
 */

export function productVisibleOnRegister(product, registerCompanyId) {
  const productBrand = product?.company_id ? String(product.company_id) : null;
  if (!productBrand) return true;
  const tillBrand = registerCompanyId ? String(registerCompanyId) : null;
  if (!tillBrand) return false;
  return productBrand === tillBrand;
}

export function filterCatalogForRegister(products, registerCompanyId) {
  return (Array.isArray(products) ? products : []).filter((row) =>
    productVisibleOnRegister(row, registerCompanyId)
  );
}

/** Sale brand is the register's brand. Never trust a spoofed body company_id. */
export function saleCompanyIdFromRegister(register) {
  return register?.company_id ? String(register.company_id) : null;
}
